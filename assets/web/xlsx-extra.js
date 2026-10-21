/* 엑셀(.xlsx) 보강 모듈.
 *
 * SheetJS 커뮤니티판은 셀 서식(글꼴·테두리·정렬)과 도형(drawing)을 읽어 주지 않으므로,
 * xlsx(zip)를 직접 열어 styles.xml / 시트 XML / drawing XML 을 해석한다.
 * 도형은 pptx-browser 의 렌더러(PptxBrowser.renderSpTree)를 그대로 재사용해 캔버스에 그린다.
 * 어떤 단계가 실패해도 호출하는 쪽이 SheetJS 만으로 계속 그릴 수 있게 모두 예외를 던진다.
 */
(function (global) {
  'use strict';

  var EMU_PX = 9525;
  var THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  var INDEXED = {
    0: '000000', 1: 'FFFFFF', 2: 'FF0000', 3: '00FF00', 4: '0000FF', 5: 'FFFF00', 6: 'FF00FF', 7: '00FFFF',
    8: '000000', 9: 'FFFFFF', 10: 'FF0000', 11: '00FF00', 12: '0000FF', 13: 'FFFF00', 14: 'FF00FF', 15: '00FFFF',
    16: '800000', 17: '008000', 18: '000080', 19: '808000', 20: '800080', 21: '008080', 22: 'C0C0C0', 23: '808080',
  };
  var FONT_FALLBACK = ",'Malgun Gothic','Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo',sans-serif";

  function parseXml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }
  function kids(el, name) {
    var out = [];
    if (!el) return out;
    for (var i = 0; i < el.children.length; i++) if (el.children[i].localName === name) out.push(el.children[i]);
    return out;
  }
  function kid(el, name) {
    return kids(el, name)[0] || null;
  }
  function num(v, d) {
    var n = parseFloat(v);
    return isNaN(n) ? d : n;
  }
  function readText(zip, path) {
    var f = zip.file(path);
    return f ? f.async('string') : Promise.resolve(null);
  }
  function dirOf(path) {
    return path.slice(0, path.lastIndexOf('/') + 1);
  }
  function resolvePath(base, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    var parts = dirOf(base).split('/');
    parts.pop();
    target.split('/').forEach(function (p) {
      if (p === '..') parts.pop();
      else if (p !== '.' && p !== '') parts.push(p);
    });
    return parts.join('/');
  }
  async function readRels(zip, partPath) {
    var relsPath = dirOf(partPath) + '_rels/' + partPath.slice(partPath.lastIndexOf('/') + 1) + '.rels';
    var text = await readText(zip, relsPath);
    var map = {};
    if (!text) return map;
    var doc = parseXml(text);
    var list = doc.getElementsByTagName('Relationship');
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var external = r.getAttribute('TargetMode') === 'External';
      var target = r.getAttribute('Target') || '';
      map[r.getAttribute('Id')] = {
        type: r.getAttribute('Type') || '',
        target: target,
        external: external,
        path: external ? target : resolvePath(partPath, target),
      };
    }
    return map;
  }

  /* ---------- 색 ---------- */
  function hexToRgb(hex) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function rgbToHex(r, g, b) {
    function h(v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return h(r) + h(g) + h(b);
  }
  function applyTint(hex, tint) {
    if (!tint) return hex;
    var c = hexToRgb(hex);
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, s = 0, hh = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) hh = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh /= 6;
    }
    l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
    function hue(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return rgbToHex(hue(p, q, hh + 1 / 3) * 255, hue(p, q, hh) * 255, hue(p, q, hh - 1 / 3) * 255);
  }
  function resolveColor(el, themeArr) {
    if (!el) return null;
    var hex = null;
    if (el.getAttribute('rgb')) hex = el.getAttribute('rgb').slice(-6);
    else if (el.getAttribute('theme') != null) hex = themeArr[parseInt(el.getAttribute('theme'), 10)] || null;
    else if (el.getAttribute('indexed') != null) hex = INDEXED[parseInt(el.getAttribute('indexed'), 10)] || null;
    if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return '#' + applyTint(hex, num(el.getAttribute('tint'), 0));
  }
  function isDark(css) {
    var c = hexToRgb(css.slice(1));
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 140;
  }

  /* ---------- styles.xml ---------- */
  var BORDER_CSS = {
    thin: '1px solid', hair: '1px dotted', dotted: '1px dotted', dashed: '1px dashed', dashDot: '1px dashed',
    dashDotDot: '1px dashed', medium: '2px solid', mediumDashed: '2px dashed', mediumDashDot: '2px dashed',
    mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed', thick: '3px solid', double: '3px double',
  };

  function parseStyles(text, themeArr) {
    var doc = parseXml(text);
    var root = doc.documentElement;
    var fonts = kids(kid(root, 'fonts'), 'font').map(function (f) {
      var b = kid(f, 'b');
      var i = kid(f, 'i');
      var u = kid(f, 'u');
      var strike = kid(f, 'strike');
      var sz = kid(f, 'sz');
      var name = kid(f, 'name');
      return {
        bold: !!b && b.getAttribute('val') !== '0',
        italic: !!i && i.getAttribute('val') !== '0',
        underline: !!u && u.getAttribute('val') !== 'none',
        strike: !!strike && strike.getAttribute('val') !== '0',
        size: sz ? num(sz.getAttribute('val'), 11) : 11,
        name: name ? name.getAttribute('val') : '',
        color: resolveColor(kid(f, 'color'), themeArr),
      };
    });
    var fills = kids(kid(root, 'fills'), 'fill').map(function (f) {
      var p = kid(f, 'patternFill');
      if (!p || p.getAttribute('patternType') !== 'solid') return null;
      return resolveColor(kid(p, 'fgColor'), themeArr);
    });
    var borders = kids(kid(root, 'borders'), 'border').map(function (b) {
      var out = {};
      ['left', 'right', 'top', 'bottom'].forEach(function (side) {
        var e = kid(b, side);
        var style = e && e.getAttribute('style');
        if (!style || !BORDER_CSS[style]) return;
        out[side] = BORDER_CSS[style] + ' ' + (resolveColor(kid(e, 'color'), themeArr) || '#000');
      });
      return out;
    });
    var xfs = kids(kid(root, 'cellXfs'), 'xf').map(function (x) {
      var a = kid(x, 'alignment');
      return {
        font: fonts[num(x.getAttribute('fontId'), 0)] || fonts[0] || null,
        fill: fills[num(x.getAttribute('fillId'), 0)] || null,
        border: borders[num(x.getAttribute('borderId'), 0)] || {},
        h: a ? a.getAttribute('horizontal') : null,
        v: a ? a.getAttribute('vertical') : null,
        wrap: !!a && (a.getAttribute('wrapText') === '1' || a.getAttribute('wrapText') === 'true'),
        indent: a ? num(a.getAttribute('indent'), 0) : 0,
      };
    });
    return { fonts: fonts, xfs: xfs };
  }

  /* ---------- 시트 XML ---------- */
  function colToIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }
  function parseRef(ref) {
    var m = /^([A-Z]+)(\d+)$/.exec(ref || '');
    return m ? { r: parseInt(m[2], 10) - 1, c: colToIndex(m[1]) } : null;
  }

  async function parseSheet(ctx, path) {
    var text = await readText(ctx.zip, path);
    if (!text) return null;
    var root = parseXml(text).documentElement;
    var rels = await readRels(ctx.zip, path);

    var info = {
      showGrid: true,
      defaultRowPx: 20,
      defaultColChars: null,
      cols: [],
      rows: {},
      cells: {},
      hyperlinks: {},
      drawingPath: null,
      maxRow: -1,
      maxCol: -1,
    };

    var views = kid(kid(root, 'sheetViews'), 'sheetView');
    if (views && views.getAttribute('showGridLines') === '0') info.showGrid = false;

    var fmt = kid(root, 'sheetFormatPr');
    if (fmt) {
      info.defaultRowPx = Math.round((num(fmt.getAttribute('defaultRowHeight'), 15) * 4) / 3);
      if (fmt.getAttribute('defaultColWidth')) info.defaultColChars = num(fmt.getAttribute('defaultColWidth'), null);
      else info.baseColChars = num(fmt.getAttribute('baseColWidth'), 8);
    }

    kids(kid(root, 'cols'), 'col').forEach(function (c) {
      info.cols.push({
        min: parseInt(c.getAttribute('min'), 10) - 1,
        max: parseInt(c.getAttribute('max'), 10) - 1,
        width: num(c.getAttribute('width'), null),
        style: c.getAttribute('style') != null ? parseInt(c.getAttribute('style'), 10) : null,
        hidden: c.getAttribute('hidden') === '1' || c.getAttribute('hidden') === 'true',
      });
    });

    kids(kid(root, 'sheetData'), 'row').forEach(function (row) {
      var r = parseInt(row.getAttribute('r'), 10) - 1;
      var ri = { hidden: row.getAttribute('hidden') === '1' || row.getAttribute('hidden') === 'true' };
      if (row.getAttribute('ht')) ri.px = Math.round((num(row.getAttribute('ht'), 15) * 4) / 3);
      if (row.getAttribute('s') != null && (row.getAttribute('customFormat') === '1' || row.getAttribute('customFormat') === 'true')) {
        ri.style = parseInt(row.getAttribute('s'), 10);
      }
      info.rows[r] = ri;
      kids(row, 'c').forEach(function (c) {
        var s = c.getAttribute('s');
        if (s == null) return;
        var pos = parseRef(c.getAttribute('r'));
        if (!pos) return;
        info.cells[pos.r + ',' + pos.c] = parseInt(s, 10);
        if (pos.r > info.maxRow) info.maxRow = pos.r;
        if (pos.c > info.maxCol) info.maxCol = pos.c;
      });
    });

    kids(kid(root, 'hyperlinks'), 'hyperlink').forEach(function (h) {
      var start = parseRef((h.getAttribute('ref') || '').split(':')[0]);
      var end = parseRef((h.getAttribute('ref') || '').split(':').pop());
      if (!start || !end) return;
      var rid = h.getAttribute('r:id') || h.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      var link = { location: h.getAttribute('location'), url: rid && rels[rid] ? rels[rid].target : null };
      for (var r = start.r; r <= end.r; r++) for (var c = start.c; c <= end.c; c++) info.hyperlinks[r + ',' + c] = link;
    });

    var drawing = kid(root, 'drawing');
    if (drawing) {
      var did = drawing.getAttribute('r:id') || drawing.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      if (did && rels[did]) info.drawingPath = rels[did].path;
    }
    return info;
  }

  /* ---------- 공개 API ---------- */
  var api = {};

  api.load = async function (buffer) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip 없음');
    var zip = await JSZip.loadAsync(buffer);
    var wbText = await readText(zip, 'xl/workbook.xml');
    if (!wbText) throw new Error('workbook.xml 없음');
    var wbRels = await readRels(zip, 'xl/workbook.xml');

    var themeArr = [];
    var themePath = 'xl/theme/theme1.xml';
    Object.keys(wbRels).forEach(function (id) {
      if (/\/theme$/.test(wbRels[id].type)) themePath = wbRels[id].path;
    });
    var themeText = await readText(zip, themePath);
    if (themeText) {
      var scheme = parseXml(themeText).getElementsByTagNameNS('*', 'clrScheme')[0];
      THEME_ORDER.forEach(function (name, i) {
        var el = scheme ? kid(scheme, name) : null;
        var c = el && el.firstElementChild;
        var hex = c ? (c.localName === 'sysClr' ? c.getAttribute('lastClr') : c.getAttribute('val')) : null;
        themeArr[i] = hex || null;
      });
    }

    var stylesText = await readText(zip, 'xl/styles.xml');
    var styles = stylesText ? parseStyles(stylesText, themeArr) : { fonts: [], xfs: [] };

    var sheetPaths = {};
    var sheetsEl = kid(parseXml(wbText).documentElement, 'sheets');
    kids(sheetsEl, 'sheet').forEach(function (s) {
      var rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      if (rid && wbRels[rid]) sheetPaths[s.getAttribute('name')] = wbRels[rid].path;
    });

    var base = styles.fonts[0];
    var fname = base ? base.name : '';
    // 기본 글꼴의 숫자 최대 폭(px). 열 너비(문자 수)를 픽셀로 바꾸는 데 쓰인다.
    var mdw = /malgun|맑은|gulim|굴림|dotum|돋움|batang|바탕/i.test(fname) ? 8 : 7;
    if (base && base.size >= 12 && mdw === 7) mdw = 8;

    return { zip: zip, themeArr: themeArr, styles: styles, sheetPaths: sheetPaths, mdw: mdw, sheetCache: {}, themePath: themePath };
  };

  api.sheetInfo = async function (ctx, name) {
    if (ctx.sheetCache[name] !== undefined) return ctx.sheetCache[name];
    var info = null;
    try {
      info = ctx.sheetPaths[name] ? await parseSheet(ctx, ctx.sheetPaths[name]) : null;
    } catch (e) {
      info = null;
    }
    ctx.sheetCache[name] = info;
    return info;
  };

  api.colPx = function (ctx, info, c) {
    for (var i = 0; i < info.cols.length; i++) {
      var d = info.cols[i];
      if (c >= d.min && c <= d.max && d.width != null) return d.hidden ? 0 : Math.round(d.width * ctx.mdw);
    }
    var chars = info.defaultColChars != null ? info.defaultColChars : ((info.baseColChars || 8) * ctx.mdw + 5) / ctx.mdw;
    return Math.round(chars * ctx.mdw);
  };
  api.colHidden = function (info, c) {
    for (var i = 0; i < info.cols.length; i++) {
      var d = info.cols[i];
      if (c >= d.min && c <= d.max) return d.hidden;
    }
    return false;
  };
  api.rowPx = function (info, r) {
    var ri = info.rows[r];
    if (ri && ri.hidden) return 0;
    return ri && ri.px ? ri.px : info.defaultRowPx;
  };
  api.rowHidden = function (info, r) {
    return !!(info.rows[r] && info.rows[r].hidden);
  };

  // 셀의 서식 번호: 셀 자체 → 행 서식 → 열 서식 순.
  api.xfIndex = function (info, r, c) {
    var own = info.cells[r + ',' + c];
    if (own != null) return own;
    var ri = info.rows[r];
    if (ri && ri.style != null) return ri.style;
    for (var i = 0; i < info.cols.length; i++) {
      var d = info.cols[i];
      if (c >= d.min && c <= d.max && d.style != null) return d.style;
    }
    return 0;
  };

  api.xf = function (ctx, index) {
    return ctx.styles.xfs[index] || ctx.styles.xfs[0] || null;
  };

  // td 에 적용할 CSS(글꼴·배경·정렬). 테두리는 이웃 셀과 합쳐야 해서 따로 다룬다.
  api.cellStyle = function (ctx, index) {
    var xf = api.xf(ctx, index);
    var out = { css: '', fill: null, wrap: false, hAlign: null };
    if (!xf) return out;
    var css = [];
    var f = xf.font;
    if (f) {
      css.push('font-size:' + Math.round(f.size * 4 / 3 * 10) / 10 + 'px');
      if (f.name) css.push("font-family:'" + f.name.replace(/'/g, '') + "'" + FONT_FALLBACK);
      if (f.bold) css.push('font-weight:700');
      if (f.italic) css.push('font-style:italic');
      var deco = [];
      if (f.underline) deco.push('underline');
      if (f.strike) deco.push('line-through');
      if (deco.length) css.push('text-decoration:' + deco.join(' '));
      if (f.color) css.push('color:' + f.color);
      else if (xf.fill && isDark(xf.fill)) css.push('color:#fff');
    }
    if (xf.fill) {
      css.push('background-color:' + xf.fill);
      out.fill = xf.fill;
    }
    var v = xf.v === 'center' ? 'middle' : xf.v === 'top' ? 'top' : 'bottom';
    css.push('vertical-align:' + v);
    if (xf.h) {
      var h = { left: 'left', center: 'center', centerContinuous: 'center', right: 'right', justify: 'justify', distributed: 'center' }[xf.h];
      if (h) {
        css.push('text-align:' + h);
        out.hAlign = h;
      }
    }
    if (xf.indent) css.push('padding-left:' + (3 + xf.indent * 9) + 'px');
    if (xf.wrap) {
      css.push('white-space:pre-wrap');
      css.push('overflow-wrap:anywhere');
      out.wrap = true;
    }
    out.css = css.join(';');
    return out;
  };

  api.borders = function (ctx, index) {
    var xf = api.xf(ctx, index);
    return (xf && xf.border) || {};
  };

  /* ---------- 도형 ---------- */
  async function loadDrawing(ctx, path) {
    var P = global.PptxBrowser;
    if (!P || !P.renderSpTree || !P.getRels || !P.loadImages || !P.parseTheme || !P.buildThemeColors) {
      throw new Error('도형 렌더러 없음');
    }
    var text = await readText(ctx.zip, path);
    if (!text) throw new Error('drawing 없음');
    var doc = parseXml(text);

    var files = {};
    var relsPath = dirOf(path) + '_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels';
    var rf = ctx.zip.file(relsPath);
    if (rf) files[relsPath] = await rf.async('uint8array');
    var rels = await P.getRels(files, path);
    var imgExt = /\.(png|jpe?g|gif|webp|bmp|tiff?|svg)$/i;
    var names = Object.keys(rels);
    for (var i = 0; i < names.length; i++) {
      var rel = rels[names[i]];
      if (rel.external || !imgExt.test(rel.fullPath)) continue;
      var f = ctx.zip.file(rel.fullPath);
      if (f) files[rel.fullPath] = await f.async('uint8array');
    }
    var imageCache = await P.loadImages(files, rels);

    var themeText = await readText(ctx.zip, ctx.themePath);
    var themeData = themeText ? P.parseTheme(P.parseXml(themeText)) : { colors: {}, majorFont: 'Calibri', minorFont: 'Calibri' };
    var themeColors = P.buildThemeColors(themeData, { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' });
    return { doc: doc, rels: rels, files: files, imageCache: imageCache, themeData: themeData, themeColors: themeColors };
  }

  function drawableChildren(anchor) {
    var out = [];
    for (var i = 0; i < anchor.children.length; i++) {
      var c = anchor.children[i];
      var n = c.localName;
      if (n === 'sp' || n === 'pic' || n === 'grpSp' || n === 'cxnSp') {
        out.push(c);
      } else if (n === 'AlternateContent') {
        var choice = kid(c, 'Choice') || kid(c, 'Fallback');
        if (choice) out = out.concat(drawableChildren(choice));
      }
    }
    return out;
  }

  function objectXfrm(obj) {
    var holder = obj.localName === 'grpSp' ? kid(obj, 'grpSpPr') : kid(obj, 'spPr');
    var x = holder ? kid(holder, 'xfrm') : null;
    if (!x) return null;
    var off = kid(x, 'off');
    var ext = kid(x, 'ext');
    if (!off || !ext) return null;
    return {
      x: num(off.getAttribute('x'), 0) / EMU_PX,
      y: num(off.getAttribute('y'), 0) / EMU_PX,
      w: num(ext.getAttribute('cx'), 0) / EMU_PX,
      h: num(ext.getAttribute('cy'), 0) / EMU_PX,
    };
  }

  // pptx-browser 는 중첩된 그룹의 좌표 변환을 합성하지 못한다. 그룹을 풀어서 모든 도형의 xfrm 을
  // 바깥(앵커 기준) 좌표로 바꾼 사본 목록을 만든다. 그룹 자체의 회전/반전은 무시한다.
  function groupMap(grp) {
    var x = kid(kid(grp, 'grpSpPr'), 'xfrm');
    if (!x) return null;
    var off = kid(x, 'off');
    var ext = kid(x, 'ext');
    var chOff = kid(x, 'chOff');
    var chExt = kid(x, 'chExt');
    if (!off || !ext || !chOff || !chExt) return null;
    var cw = num(chExt.getAttribute('cx'), 0);
    var ch = num(chExt.getAttribute('cy'), 0);
    return {
      ox: num(off.getAttribute('x'), 0),
      oy: num(off.getAttribute('y'), 0),
      sx: cw > 0 ? num(ext.getAttribute('cx'), 0) / cw : 1,
      sy: ch > 0 ? num(ext.getAttribute('cy'), 0) / ch : 1,
      cx: num(chOff.getAttribute('x'), 0),
      cy: num(chOff.getAttribute('y'), 0),
    };
  }

  function flatten(node, maps, out) {
    if (node.localName === 'grpSp') {
      var m = groupMap(node);
      var next = m ? [m].concat(maps) : maps;
      for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i];
        if (c.localName === 'sp' || c.localName === 'pic' || c.localName === 'cxnSp' || c.localName === 'grpSp') {
          flatten(c, next, out);
        }
      }
      return;
    }
    var copy = node.cloneNode(true);
    var x = kid(kid(copy, 'spPr'), 'xfrm');
    var off = x && kid(x, 'off');
    var ext = x && kid(x, 'ext');
    if (off && ext && maps.length) {
      var px = num(off.getAttribute('x'), 0);
      var py = num(off.getAttribute('y'), 0);
      var w = num(ext.getAttribute('cx'), 0);
      var h = num(ext.getAttribute('cy'), 0);
      maps.forEach(function (g) {
        px = g.ox + (px - g.cx) * g.sx;
        py = g.oy + (py - g.cy) * g.sy;
        w = w * g.sx;
        h = h * g.sy;
      });
      off.setAttribute('x', String(Math.round(px)));
      off.setAttribute('y', String(Math.round(py)));
      ext.setAttribute('cx', String(Math.round(w)));
      ext.setAttribute('cy', String(Math.round(h)));
    }
    out.push(copy);
  }

  function anchorPoint(el, geo) {
    var col = num((kid(el, 'col') || {}).textContent, 0);
    var row = num((kid(el, 'row') || {}).textContent, 0);
    var colOff = num((kid(el, 'colOff') || {}).textContent, 0) / EMU_PX;
    var rowOff = num((kid(el, 'rowOff') || {}).textContent, 0) / EMU_PX;
    return { x: geo.xOfCol(col) + colOff, y: geo.yOfRow(row) + rowOff, col: col, row: row };
  }

  // 도형이 차지하는 셀 범위(표를 어디까지 그려야 하는지 알기 위해).
  api.drawingExtent = async function (ctx, info) {
    var ext = { row: -1, col: -1 };
    if (!info || !info.drawingPath) return ext;
    var text = await readText(ctx.zip, info.drawingPath);
    if (!text) return ext;
    var root = parseXml(text).documentElement;
    for (var i = 0; i < root.children.length; i++) {
      var a = root.children[i];
      var to = kid(a, 'to') || kid(a, 'from');
      if (!to) continue;
      var col = num((kid(to, 'col') || {}).textContent, -1);
      var row = num((kid(to, 'row') || {}).textContent, -1);
      if (col > ext.col) ext.col = col;
      if (row > ext.row) ext.row = row;
    }
    return ext;
  };

  /**
   * 시트의 도형들을 캔버스 하나에 그려서 돌려준다. geo = { width, height, xOfCol(c), yOfRow(r) }.
   * 각 도형은 앵커(셀 기준 위치)에 맞춰 옮기고, 열/행 크기가 파일과 조금 달라도 앵커 범위에 맞게 늘인다.
   */
  api.renderDrawings = async function (ctx, info, geo) {
    if (!info || !info.drawingPath) return null;
    var P = global.PptxBrowser;
    var d = await loadDrawing(ctx, info.drawingPath);
    var root = d.doc.documentElement;
    if (!root.children.length) return null;

    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    dpr = Math.min(dpr, 8000 / Math.max(geo.height, 1), 8000 / Math.max(geo.width, 1));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(geo.width * dpr));
    canvas.height = Math.max(1, Math.round(geo.height * dpr));
    canvas.style.width = geo.width + 'px';
    canvas.style.height = geo.height + 'px';
    canvas.className = 'sheet-drawings';
    var c = canvas.getContext('2d');
    c.scale(dpr, dpr);

    var xdr = root.namespaceURI;
    for (var i = 0; i < root.children.length; i++) {
      var anchor = root.children[i];
      var kind = anchor.localName;
      var objs = drawableChildren(anchor);
      if (!objs.length) continue;

      var box = null;
      if (kind === 'twoCellAnchor') {
        var f = anchorPoint(kid(anchor, 'from'), geo);
        var t = anchorPoint(kid(anchor, 'to'), geo);
        box = { x: f.x, y: f.y, w: t.x - f.x, h: t.y - f.y };
      } else if (kind === 'oneCellAnchor') {
        var f1 = anchorPoint(kid(anchor, 'from'), geo);
        var e1 = kid(anchor, 'ext');
        box = { x: f1.x, y: f1.y, w: num(e1 && e1.getAttribute('cx'), 0) / EMU_PX, h: num(e1 && e1.getAttribute('cy'), 0) / EMU_PX };
      } else if (kind === 'absoluteAnchor') {
        var p = kid(anchor, 'pos');
        var e2 = kid(anchor, 'ext');
        box = {
          x: num(p && p.getAttribute('x'), 0) / EMU_PX,
          y: num(p && p.getAttribute('y'), 0) / EMU_PX,
          w: num(e2 && e2.getAttribute('cx'), 0) / EMU_PX,
          h: num(e2 && e2.getAttribute('cy'), 0) / EMU_PX,
        };
      }
      if (!box) continue;

      for (var k = 0; k < objs.length; k++) {
        var obj = objs[k];
        var xf = objectXfrm(obj);
        if (!xf) continue;
        var sx = xf.w > 0 && box.w > 0 ? box.w / xf.w : 1;
        var sy = xf.h > 0 && box.h > 0 ? box.h / xf.h : 1;
        if (sx < 0.5 || sx > 2) sx = 1;
        if (sy < 0.5 || sy > 2) sy = 1;

        var wrapper = d.doc.createElementNS(xdr, 'xdr:wrapper');
        var leaves = [];
        flatten(obj, [], leaves);
        leaves.forEach(function (leaf) {
          wrapper.appendChild(leaf);
        });
        c.save();
        c.translate(box.x, box.y);
        c.scale(sx, sy);
        c.translate(-xf.x, -xf.y);
        try {
          await P.renderSpTree(c, wrapper, d.rels, d.imageCache, d.themeColors, d.themeData, 1 / EMU_PX, null, d.files);
        } catch (e) {
          if (global.console) console.warn('도형 그리기 실패', e);
        }
        c.restore();
      }
    }
    return canvas;
  };

  global.XlsxExtra = api;
})(window);
