/* 광고 없는 문서 뷰어 - 오프라인 렌더러 (모든 라이브러리는 앱에 내장) */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var kind = params.get('kind') || '';

  var statusEl = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var root = document.getElementById('root');

  var finished = false; // ready 또는 error를 이미 알렸는지

  function post(payload) {
    if (payload.type === 'ready' || payload.type === 'error') finished = true;
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

  /* ---------------- 비밀번호 ---------------- */

  // 비밀번호를 묻고, 취소하면 null을 돌려준다.
  function askPassword(message) {
    return new Promise(function (resolve) {
      setStatus(null);
      var backdrop = document.createElement('div');
      backdrop.className = 'pw-backdrop';
      var form = document.createElement('form');
      form.className = 'pw-dialog';
      var title = document.createElement('h2');
      title.textContent = '비밀번호 입력';
      var msg = document.createElement('p');
      msg.className = 'pw-msg';
      msg.textContent = message;
      var input = document.createElement('input');
      input.type = 'password';
      input.className = 'pw-input';
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'off');
      input.spellcheck = false;
      input.setAttribute('aria-label', '비밀번호');
      var actions = document.createElement('div');
      actions.className = 'pw-actions';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'pw-cancel';
      cancel.textContent = '취소';
      var ok = document.createElement('button');
      ok.type = 'submit';
      ok.className = 'pw-ok';
      ok.textContent = '확인';
      actions.appendChild(cancel);
      actions.appendChild(ok);
      [title, msg, input, actions].forEach(function (el) {
        form.appendChild(el);
      });
      backdrop.appendChild(form);
      document.body.appendChild(backdrop);
      input.focus();

      function done(value) {
        backdrop.remove();
        resolve(value);
      }
      cancel.addEventListener('click', function () {
        done(null);
      });
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (input.value) done(input.value);
      });
    });
  }

  var CANCELED = '암호로 보호된 문서입니다. 비밀번호를 입력해야 열 수 있습니다.';

  // 암호가 걸린 docx/xlsx/pptx(OLE 컨테이너)는 평문 zip으로 풀어서 돌려준다. 아니면 그대로 돌려준다.
  async function unlockOffice(buffer) {
    var bytes = new Uint8Array(buffer);
    if (typeof OfficeCrypto === 'undefined' || !OfficeCrypto.isEncryptedPackage(bytes)) return buffer;
    var message = '이 문서는 암호로 보호되어 있습니다.';
    for (;;) {
      var password = await askPassword(message);
      if (password === null) throw new Error(CANCELED);
      setStatus('비밀번호 확인 중…');
      try {
        var plain = await OfficeCrypto.decrypt(bytes, password);
        setStatus('문서를 여는 중…');
        return plain.buffer;
      } catch (e) {
        if (e && e.code === 'BAD_PASSWORD') {
          message = '비밀번호가 맞지 않습니다. 다시 입력해 주세요.';
          continue;
        }
        throw e;
      }
    }
  }

  // HWP 5.0 FileHeader의 속성 비트 1이 "암호 설정"이다. 이런 문서는 hwp.js가 못 열어 rhwp로 보낸다.
  function hwpIsPasswordProtected(buffer) {
    var header;
    try {
      header = XLSX.CFB.find(XLSX.CFB.read(new Uint8Array(buffer), { type: 'array' }), 'FileHeader');
    } catch (e) {
      return false;
    }
    var c = header && header.content;
    if (!c || c.length < 40) return false;
    var flags = c[36] | (c[37] << 8) | (c[38] << 16) | (c[39] << 24);
    return (flags & 2) !== 0;
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

  async function readWorkbook(buffer) {
    var data = new Uint8Array(buffer);
    var password;
    for (;;) {
      try {
        return XLSX.read(data, { type: 'array', cellDates: true, password: password });
      } catch (e) {
        if (!/password/i.test((e && e.message) || '')) throw e;
        var next = await askPassword(
          password === undefined ? '이 문서는 암호로 보호되어 있습니다.' : '비밀번호가 맞지 않습니다. 다시 입력해 주세요.',
        );
        if (next === null) throw new Error(CANCELED);
        password = next;
      }
    }
  }

  async function renderXlsx(buffer) {
    var wb = await readWorkbook(buffer);
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

  function renderHwpJs(buffer) {
    var host = document.createElement('div');
    host.className = 'hwp-host';
    root.appendChild(host);
    try {
      // Viewer가 내부에서 parse까지 수행한다.
      // CFB 파서는 일반 숫자 배열 + type:'array'를 기대한다(Uint8Array/ArrayBuffer는 실패).
      new HwpJs.Viewer(host, Array.from(new Uint8Array(buffer)), {
        type: 'array',
      });
    } catch (e) {
      host.remove();
      throw e;
    }
    // 페이지는 margin:auto로 가운데 정렬되므로 페이지 각각이 아니라 컨테이너 전체를 줄인다.
    fitToWidth('.hwp-host div[data-page-number]:not(.hwpjs-observer):first-of-type', function (page) {
      return page.parentElement;
    });
    post({ type: 'ready', pages: host.querySelectorAll('[data-page-number]').length });
  }

  // 진짜 HWP 5.0 문서인지: OLE 컨테이너의 FileHeader가 "HWP Document File"로 시작한다.
  function isHwp5(buffer) {
    try {
      var header = XLSX.CFB.find(XLSX.CFB.read(new Uint8Array(buffer), { type: 'array' }), 'FileHeader');
      var c = header && header.content;
      return !!c && String.fromCharCode.apply(null, Array.prototype.slice.call(c, 0, 17)) === 'HWP Document File';
    } catch (e) {
      return false;
    }
  }

  // 일반 HWP 5.0은 hwp.js로, 그 밖의 문서(암호 문서, HWP 3.0, HWPML, 확장자만 .hwp인 HWPX 등)는 rhwp로 연다.
  async function renderHwp(buffer) {
    if (typeof HwpJs === 'undefined' || !isHwp5(buffer) || hwpIsPasswordProtected(buffer)) {
      await renderRhwp(buffer);
      return;
    }
    try {
      renderHwpJs(buffer);
    } catch (e) {
      await renderRhwp(buffer);
    }
  }

  /* ---------------- HWP / HWPX (rhwp: Rust + WebAssembly) ---------------- */

  var rhwpReady = null;

  function loadRhwp() {
    if (typeof Rhwp === 'undefined') return Promise.reject(new Error('HWPX 렌더러를 찾을 수 없습니다.'));
    if (!rhwpReady) {
      var ctx = null;
      var lastFont = '';
      // rhwp가 글자 폭을 잴 때 호출하는 전역 함수(필수).
      window.measureTextWidth = function (font, text) {
        if (!ctx) ctx = document.createElement('canvas').getContext('2d');
        if (font !== lastFont) {
          ctx.font = font;
          lastFont = font;
        }
        return ctx.measureText(text).width;
      };
      rhwpReady = Rhwp.default({ module_or_path: 'vendor/rhwp_bg.wasm' });
    }
    return rhwpReady;
  }

  // 암호가 필요하면 비밀번호를 물어 연다. 틀리면 다시 묻고, 취소하면 오류로 끝낸다.
  async function openRhwp(buffer) {
    setStatus('문서를 여는 중…');
    await loadRhwp();
    var bytes = new Uint8Array(buffer);
    try {
      return new Rhwp.HwpDocument(bytes);
    } catch (e) {
      if (String(e).indexOf('비밀번호가 필요') < 0) throw e;
    }
    var message = '이 문서는 암호로 보호되어 있습니다.';
    for (;;) {
      var password = await askPassword(message);
      if (password === null) throw new Error(CANCELED);
      setStatus('문서를 여는 중…');
      try {
        return Rhwp.HwpDocument.openWithPassword(bytes, password);
      } catch (e) {
        if (String(e).indexOf('비밀번호가 일치하지 않') < 0) throw e;
        message = '비밀번호가 맞지 않습니다. 다시 입력해 주세요.';
      }
    }
  }

  async function renderRhwp(buffer) {
    var doc = await openRhwp(buffer);
    var total = doc.pageCount();
    if (!total) throw new Error('표시할 페이지가 없습니다.');

    var host = document.createElement('div');
    host.className = 'rhwp-host';
    root.appendChild(host);

    function ratioOf(svg) {
      return svg.getAttribute('width') + ' / ' + svg.getAttribute('height');
    }

    // 첫 페이지 크기를 기준으로 모든 페이지의 자리를 잡고, 화면 근처 페이지만 그린다.
    var probe = document.createElement('div');
    probe.innerHTML = doc.renderPageSvg(0);
    var defaultRatio = probe.firstElementChild ? ratioOf(probe.firstElementChild) : '793 / 1122';

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var el = entry.target;
          if (entry.isIntersecting) {
            if (el.firstChild) return;
            el.innerHTML = doc.renderPageSvg(Number(el.dataset.index));
            var svg = el.firstElementChild;
            if (!svg) return;
            if (!svg.getAttribute('viewBox')) {
              svg.setAttribute('viewBox', '0 0 ' + svg.getAttribute('width') + ' ' + svg.getAttribute('height'));
            }
            el.style.aspectRatio = ratioOf(svg); // 비워도 높이가 유지된다.
          } else if (el.firstChild) {
            el.textContent = ''; // 멀어진 페이지는 비워 메모리를 아낀다.
          }
        });
      },
      { rootMargin: '1200px 0px' },
    );

    for (var i = 0; i < total; i++) {
      var el = document.createElement('div');
      el.className = 'rhwp-page';
      el.dataset.index = String(i);
      el.style.aspectRatio = defaultRatio;
      host.appendChild(el);
      observer.observe(el);
    }
    post({ type: 'ready', pages: total });
  }

  /* ---------------- DOC (구형 Word 97-2003) ---------------- */

  function renderDoc(buffer) {
    if (typeof MsDoc === 'undefined') throw new Error('DOC 렌더러를 찾을 수 없습니다.');
    var out;
    try {
      out = MsDoc.renderMsDoc(MsDoc.parseMsDoc(buffer));
    } catch (e) {
      if (/encrypt/i.test(String((e && e.message) || ''))) {
        throw new Error('암호가 설정된 .doc 문서는 열 수 없습니다. Word에서 암호를 해제하고 저장한 뒤 다시 열어 주세요.');
      }
      throw e;
    }
    var paper = document.createElement('article');
    paper.className = 'doc-paper';
    paper.innerHTML = '<style>' + out.css + '</style><div class="msdoc-root">' + out.html + '</div>';
    root.appendChild(paper);

    // 표·이미지가 화면보다 넓으면 본문 전체를 폭에 맞춰 줄인다(이미지는 늦게 로드되므로 load에도 다시 잰다).
    var body = paper.querySelector('.msdoc-root');
    function fit() {
      body.style.zoom = '';
      var avail = paper.clientWidth - 32; // .doc-paper 좌우 패딩
      if (body.scrollWidth > avail) body.style.zoom = String(avail / body.scrollWidth);
    }
    fit();
    paper.querySelectorAll('img').forEach(function (img) {
      img.addEventListener('load', fit);
    });
    window.addEventListener('resize', fit);
    post({ type: 'ready' });
  }

  /* ---------------- PPT (구형 PowerPoint 97-2003: 텍스트만) ---------------- */

  function renderPpt(buffer) {
    if (typeof PptText === 'undefined') throw new Error('PPT 렌더러를 찾을 수 없습니다.');
    var slides = PptText.parse(buffer);
    if (!slides.length) throw new Error('슬라이드를 찾을 수 없습니다.');

    root.appendChild(
      note('구형 .ppt는 슬라이드의 텍스트만 표시합니다. 도형과 이미지까지 보려면 PowerPoint에서 .pptx로 저장해 주세요.'),
    );
    slides.forEach(function (slide, i) {
      var card = document.createElement('section');
      card.className = 'ppt-card';
      var label = document.createElement('div');
      label.className = 'slide-index';
      label.textContent = i + 1 + ' / ' + slides.length;
      card.appendChild(label);
      if (slide.title.length) {
        var h = document.createElement('h2');
        h.textContent = slide.title.join(' ');
        card.appendChild(h);
      }
      slide.body.forEach(function (line) {
        var p = document.createElement('p');
        p.textContent = line;
        card.appendChild(p);
      });
      if (!slide.title.length && !slide.body.length) card.appendChild(note('(텍스트 없음)'));
      root.appendChild(card);
    });
    post({ type: 'ready', pages: slides.length });
  }

  /* ---------------- MARKDOWN / IMAGE ---------------- */

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

      if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx') buffer = await unlockOffice(buffer);

      if (kind === 'docx') {
        await renderDocx(buffer);
      } else if (kind === 'xlsx') {
        await renderXlsx(buffer);
      } else if (kind === 'pptx') {
        await renderPptx(buffer);
      } else if (kind === 'hwp') {
        await renderHwp(buffer);
      } else if (kind === 'hwpx') {
        await renderRhwp(buffer);
      } else if (kind === 'doc') {
        renderDoc(buffer);
      } else if (kind === 'ppt') {
        renderPpt(buffer);
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
      showError(friendlyMessage(error));
    }
  })();

  // 라이브러리가 던지는 영어 원문(zip 손상 등)을 사용자가 이해할 수 있는 말로 바꾼다.
  function friendlyMessage(error) {
    var message = (error && error.message) || String(error || '');
    if (/zip|central directory|eocd|end of central/i.test(message)) {
      return '파일이 손상되었거나 형식이 올바르지 않습니다. 다른 프로그램에서 열어 보거나 다시 내려받아 주세요.';
    }
    if (/UNSUPPORTED_FILE_FORMAT|유효하지 않은 파일/.test(message)) {
      return '한글(HWP/HWPX) 문서가 아니거나 손상된 파일입니다.';
    }
    return message || '문서를 여는 중 문제가 발생했습니다.';
  }

  // 안전망: 라이브러리가 비동기로 실패하면(예외가 전달되지 않으면) 로딩 표시만 영원히 도는 문제가 있었다.
  // 렌더링이 끝나기 전에 처리되지 않은 오류가 나면 화면에 알린다.
  window.addEventListener('unhandledrejection', function (event) {
    if (!finished) showError(friendlyMessage(event.reason) || '문서를 표시할 수 없습니다.');
  });
  window.addEventListener('error', function (event) {
    // 브라우저가 무해하게 내는 ResizeObserver 알림은 오류가 아니다.
    if (/ResizeObserver/i.test(event.message || '')) return;
    if (!finished) showError(friendlyMessage(event.error || event.message));
  });
})();
