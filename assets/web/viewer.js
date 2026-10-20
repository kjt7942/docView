/* 광고 없는 문서 뷰어 - 오프라인 렌더러 (모든 라이브러리는 앱에 내장) */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var kind = params.get('kind') || '';

  var statusEl = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var root = document.getElementById('root');

  function post(payload) {
    try {
      if (window.DocumentBridge) {
        window.DocumentBridge.postMessage(JSON.stringify(payload));
      }
    } catch (e) {
      /* 브리지가 없으면 무시 (브라우저 미리보기) */
    }
  }

  function setStatus(text) {
    if (text) {
      statusEl.classList.remove('hidden');
      statusEl.classList.remove('error');
      statusText.textContent = text;
    } else {
      statusEl.classList.add('hidden');
    }
  }

  function showError(message) {
    statusEl.classList.remove('hidden');
    statusEl.classList.add('error');
    statusText.textContent = message;
    post({ type: 'error', message: message });
  }

  function note(text) {
    var el = document.createElement('p');
    el.className = 'render-note';
    el.textContent = text;
    return el;
  }

  async function loadBytes() {
    // 토큰은 현재 페이지 경로(/<token>/viewer.html)에 있으므로 상대 경로로 요청한다.
    var res = await fetch('file', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error('파일을 불러오지 못했습니다. (' + res.status + ')');
    }
    return await res.arrayBuffer();
  }

  /* 문서 페이지가 화면보다 넓으면 폭에 맞춰 줄인다. 이후 확대는 핀치 줌으로 한다.
   * target: 줄일 요소를 돌려주는 함수(기본은 선택자에 걸린 페이지 자신), measure: 폭을 재는 요소. */
  function fitToWidth(selector, target) {
    function apply() {
      var avail = root.clientWidth - 24; // .root 좌우 패딩
      document.querySelectorAll(selector).forEach(function (el) {
        var t = target ? target(el) : el;
        t.style.zoom = '';
        var w = el.offsetWidth;
        if (w > avail) t.style.zoom = String(avail / w);
      });
    }
    apply();
    window.addEventListener('resize', apply);
  }

  /* ---------------- DOCX ---------------- */

  async function renderDocx(buffer) {
    if (typeof docx === 'undefined') throw new Error('DOCX 렌더러를 찾을 수 없습니다.');
    await docx.renderAsync(buffer, root, null, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      useBase64URL: true,
    });
    fitToWidth('.docx-wrapper > section.docx');
    post({ type: 'ready' });
  }

  /* ---------------- XLSX / CSV ---------------- */

  function renderXlsx(buffer) {
    var wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
    var names = wb.SheetNames || [];
    if (!names.length) throw new Error('시트를 찾을 수 없습니다.');

    var tabs = document.createElement('div');
    tabs.className = 'sheet-tabs';
    var host = document.createElement('div');
    host.className = 'sheet-host';

    var MAX_ROWS = 200;
    var MAX_COLS = 80;

    function renderSheet(name) {
      Array.prototype.forEach.call(tabs.children, function (button) {
        button.classList.toggle('active', button.textContent === name);
      });
      host.innerHTML = '';

      var ws = wb.Sheets[name];
      if (!ws || !ws['!ref']) {
        host.appendChild(note('빈 시트입니다.'));
        return;
      }

      var range = XLSX.utils.decode_range(ws['!ref']);
      var endRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
      var endCol = Math.min(range.e.c, range.s.c + MAX_COLS - 1);

      var rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: true,
        range: { s: { r: range.s.r, c: range.s.c }, e: { r: endRow, c: endCol } },
      });

      var table = document.createElement('table');
      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        (row || []).forEach(function (value) {
          var td = document.createElement('td');
          td.textContent = value == null ? '' : String(value);
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      host.appendChild(table);

      var hiddenRows = range.e.r - endRow;
      var hiddenCols = range.e.c - endCol;
      if (hiddenRows > 0 || hiddenCols > 0) {
        host.appendChild(
          note(
            '미리보기 제한: ' +
              (hiddenRows > 0 ? hiddenRows + '개 행' : '') +
              (hiddenRows > 0 && hiddenCols > 0 ? ', ' : '') +
              (hiddenCols > 0 ? hiddenCols + '개 열' : '') +
              '은 표시하지 않았습니다.',
          ),
        );
      }
    }

    names.forEach(function (name) {
      var button = document.createElement('button');
      button.className = 'sheet-tab';
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('click', function () {
        renderSheet(name);
      });
      tabs.appendChild(button);
    });

    root.appendChild(tabs);
    root.appendChild(host);
    renderSheet(names[0]);
    post({ type: 'ready', pages: names.length });
  }

  /* ---------------- PPTX ---------------- */

  async function renderPptx(buffer) {
    var renderer = new PptxBrowser.PptxRenderer();
    await renderer.load(new Uint8Array(buffer));

    var total = renderer.slideCount || 0;
    if (!total) throw new Error('슬라이드를 찾을 수 없습니다.');

    var width = Math.min(Math.max(root.clientWidth - 8, 320), 1100);
    for (var i = 0; i < total; i++) {
      setStatus('슬라이드 ' + (i + 1) + ' / ' + total + ' 렌더링 중…');
      var wrap = document.createElement('div');
      wrap.className = 'slide';
      var canvas = document.createElement('canvas');
      var label = document.createElement('div');
      label.className = 'slide-index';
      label.textContent = i + 1 + ' / ' + total;
      wrap.appendChild(canvas);
      wrap.appendChild(label);
      root.appendChild(wrap);
      await renderer.renderSlide(i, canvas, width);
    }

    post({ type: 'ready', pages: total });
  }

  /* ---------------- HWP 5.0 ---------------- */

  function renderHwp(buffer) {
    if (typeof HwpJs === 'undefined') throw new Error('HWP 렌더러를 찾을 수 없습니다.');
    var host = document.createElement('div');
    host.className = 'hwp-host';
    root.appendChild(host);
    // Viewer가 내부에서 parse까지 수행한다.
    // CFB 파서는 일반 숫자 배열 + type:'array'를 기대한다(Uint8Array/ArrayBuffer는 실패).
    new HwpJs.Viewer(host, Array.from(new Uint8Array(buffer)), {
      type: 'array',
    });
    // 페이지는 margin:auto로 가운데 정렬되므로 페이지 각각이 아니라 컨테이너 전체를 줄인다.
    fitToWidth('.hwp-host div[data-page-number]:not(.hwpjs-observer):first-of-type', function (page) {
      return page.parentElement;
    });
    post({ type: 'ready', pages: host.querySelectorAll('[data-page-number]').length });
  }

  /* ---------------- TEXT / IMAGE ---------------- */

  function renderText(buffer) {
    var pre = document.createElement('pre');
    pre.className = 'text-doc';
    pre.textContent = new TextDecoder('utf-8').decode(buffer);
    root.appendChild(pre);
    post({ type: 'ready' });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inlineMd(s) {
    s = escapeHtml(s);
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  }

  // ponytail: 제목/목록(중첩)/인용/코드블록/표/수평선/굵게/기울임만 지원. 그 외 문법은 문단으로 보인다.
  function mdToHtml(src) {
    var out = [];
    var lists = []; // 열린 목록 스택: { tag, indent }
    var code = null;
    var lines = src.replace(/\r\n?/g, '\n').split('\n');

    function closeLists(toIndent) {
      while (lists.length && lists[lists.length - 1].indent >= toIndent) {
        out.push('</' + lists.pop().tag + '>');
      }
    }
    function cells(line) {
      return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
    }
    function isTableSep(line) {
      return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.indexOf('|') >= 0;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m;

      if (/^```/.test(line)) {
        if (code === null) { closeLists(0); code = []; }
        else { out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); code = null; }
        continue;
      }
      if (code !== null) { code.push(line); continue; }

      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        closeLists(0);
        out.push('<table><thead><tr>' + cells(line).map(function (c) {
          return '<th>' + inlineMd(c.trim()) + '</th>';
        }).join('') + '</tr></thead><tbody>');
        i += 2;
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim() !== '') {
          out.push('<tr>' + cells(lines[i]).map(function (c) {
            return '<td>' + inlineMd(c.trim()) + '</td>';
          }).join('') + '</tr>');
          i++;
        }
        i--;
        out.push('</tbody></table>');
        continue;
      }

      var item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (item) {
        var indent = item[1].replace(/\t/g, '    ').length;
        var tag = /\d/.test(item[2].charAt(0)) ? 'ol' : 'ul';
        var top = lists[lists.length - 1];
        if (top && indent < top.indent) closeLists(indent + 1);
        top = lists[lists.length - 1];
        if (top && indent === top.indent && top.tag !== tag) { closeLists(indent); top = null; }
        if (!top || indent > top.indent) {
          lists.push({ tag: tag, indent: indent });
          out.push('<' + tag + '>');
        }
        out.push('<li>' + inlineMd(item[3]) + '</li>');
        continue;
      }

      closeLists(0);
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
        out.push('<h' + m[1].length + '>' + inlineMd(m[2]) + '</h' + m[1].length + '>');
      } else if ((m = /^>\s?(.*)$/.exec(line))) {
        out.push('<blockquote>' + inlineMd(m[1]) + '</blockquote>');
      } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr>');
      } else if (line.trim() !== '') {
        out.push('<p>' + inlineMd(line) + '</p>');
      }
    }
    closeLists(0);
    if (code !== null) out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
    return out.join('\n');
  }

  function renderMarkdown(buffer) {
    var article = document.createElement('article');
    article.className = 'md-doc';
    article.innerHTML = mdToHtml(new TextDecoder('utf-8').decode(buffer));
    root.appendChild(article);
    post({ type: 'ready' });
  }

  function renderImage(buffer) {
    var url = URL.createObjectURL(new Blob([buffer]));
    var host = document.createElement('div');
    host.className = 'image-host';
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.onload = function () {
      post({ type: 'ready' });
    };
    img.onerror = function () {
      showError('이미지를 표시할 수 없습니다.');
    };
    host.appendChild(img);
    root.appendChild(host);

    // 회전하면 레이아웃 크기가 바뀌지 않으므로, 90도 단위일 때 상자 크기를 맞바꾼다.
    var turns = 0;
    function applyRotation() {
      var w = img.naturalWidth, h = img.naturalHeight;
      var sideways = turns % 2 === 1;
      var availW = root.clientWidth - 24; // .root 좌우 패딩
      var boxW = sideways ? h : w, boxH = sideways ? w : h;
      var scale = Math.min(1, availW / boxW);
      host.style.width = boxW * scale + 'px';
      host.style.height = boxH * scale + 'px';
      host.style.position = 'relative';
      host.style.margin = '0 auto';
      img.style.cssText =
        'position:absolute;left:50%;top:50%;max-width:none;width:' + w * scale + 'px;height:' + h * scale + 'px;' +
        'transform:translate(-50%,-50%) rotate(' + turns * 90 + 'deg);';
    }
    var rotate = document.createElement('button');
    rotate.className = 'rotate-btn';
    rotate.type = 'button';
    rotate.setAttribute('aria-label', '회전');
    rotate.textContent = '⟳';
    rotate.addEventListener('click', function () {
      turns = (turns + 1) % 4;
      applyRotation();
    });
    document.body.appendChild(rotate);
    img.addEventListener('load', applyRotation);
    window.addEventListener('resize', applyRotation);

    window.addEventListener('pagehide', function () {
      URL.revokeObjectURL(url);
    });
  }

  /* ---------------- 부트스트랩 ---------------- */

  (async function boot() {
    try {
      var buffer = await loadBytes();
      root.hidden = false;

      if (kind === 'docx') {
        await renderDocx(buffer);
      } else if (kind === 'xlsx') {
        renderXlsx(buffer);
      } else if (kind === 'pptx') {
        await renderPptx(buffer);
      } else if (kind === 'hwp') {
        renderHwp(buffer);
      } else if (kind === 'text') {
        renderText(buffer);
      } else if (kind === 'markdown') {
        renderMarkdown(buffer);
      } else if (kind === 'image') {
        renderImage(buffer);
      } else {
        throw new Error('지원하지 않는 형식입니다.');
      }
      setStatus(null);
    } catch (error) {
      root.hidden = true;
      showError((error && error.message) || '문서를 여는 중 문제가 발생했습니다.');
    }
  })();
})();
