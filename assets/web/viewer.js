/* 광고 없는 문서 뷰어 - 오프라인 렌더러 (모든 라이브러리는 앱에 내장) */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var kind = params.get('kind') || '';
  var token = params.get('token') || '';

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
    var res = await fetch('/file?token=' + encodeURIComponent(token), {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error('파일을 불러오지 못했습니다. (' + res.status + ')');
    }
    return await res.arrayBuffer();
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
