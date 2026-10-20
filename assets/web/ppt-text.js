/* 구형 PowerPoint(.ppt, 97-2003 바이너리)의 슬라이드 텍스트 추출.
 *
 * 공개 라이선스로 쓸 수 있는 .ppt 렌더러가 없어, [MS-PPT]의 레코드 구조에서 텍스트만 읽는다.
 * 도형·이미지·서식은 복원하지 않는다. OLE(CFB) 해석은 SheetJS의 XLSX.CFB를 재사용한다.
 *
 * 슬라이드별 텍스트는 두 곳에 나뉘어 있다.
 *  - Document 컨테이너의 SlideListWithText(instance 0): 제목/본문 같은 플레이스홀더 텍스트
 *  - 각 Slide 컨테이너의 ClientTextbox: 일반 텍스트 상자·도형 안의 텍스트
 * i번째 SlidePersistAtom과 i번째 Slide 컨테이너를 같은 슬라이드로 본다.
 */
(function (root) {
  'use strict';

  var RT = {
    DOCUMENT: 0x03e8,
    SLIDE: 0x03ee,
    SLIDE_LIST: 0x0ff0,
    SLIDE_PERSIST: 0x03f3,
    CLIENT_TEXTBOX: 0x0f00,
    TEXT_HEADER: 0x0f9f,
    TEXT_CHARS: 0x0fa0,
    TEXT_BYTES: 0x0fa8,
  };
  // TextHeaderAtom의 텍스트 종류: 제목(0), 가운데 제목(6)
  var TITLE_TYPES = { 0: true, 6: true };
  var ENCRYPTED_TOKEN = 0xf3d1c4df; // "Current User" 스트림의 headerToken

  function fail(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function stream(cfb, name) {
    var entry = root.XLSX.CFB.find(cfb, name);
    return entry && entry.content ? new Uint8Array(entry.content) : null;
  }

  // 레코드 헤더: recVer/recInstance(2) recType(2) recLen(4)
  function readHeader(d, at) {
    var view = new DataView(d.buffer, d.byteOffset + at, 8);
    var verInst = view.getUint16(0, true);
    return { ver: verInst & 0xf, instance: verInst >> 4, type: view.getUint16(2, true), len: view.getUint32(4, true) };
  }

  /** [start, end) 범위의 레코드를 순회한다. cb가 true를 돌려주면 그 컨테이너 안으로 내려가지 않는다. */
  function walk(d, start, end, cb) {
    var at = start;
    while (at + 8 <= end) {
      var h = readHeader(d, at);
      var bodyStart = at + 8;
      var bodyEnd = bodyStart + h.len;
      if (bodyEnd > end) return;
      var skip = cb(h, bodyStart, bodyEnd);
      if (h.ver === 0xf && !skip) walk(d, bodyStart, bodyEnd, cb);
      at = bodyEnd;
    }
  }

  function decodeText(d, rec, start, end) {
    var bytes = d.subarray(start, end);
    var text =
      rec.type === RT.TEXT_CHARS
        ? new TextDecoder('utf-16le').decode(bytes)
        : new TextDecoder('windows-1252').decode(bytes);
    // 문단은 \r, 줄바꿈은 \v로 저장된다.
    return text.replace(/\u000b/g, '\n').split(/\r\n?|\n/);
  }

  function parse(buffer) {
    var cfb = root.XLSX.CFB.read(new Uint8Array(buffer), { type: 'array' });
    var current = stream(cfb, 'Current User');
    // CurrentUserAtom: 레코드 헤더(8) + size(4) + headerToken(4)
    if (current && current.length >= 16 && new DataView(current.buffer, current.byteOffset, 16).getUint32(12, true) === ENCRYPTED_TOKEN) {
      throw fail('ENCRYPTED', '암호가 설정된 .ppt 문서는 열 수 없습니다. PowerPoint에서 암호를 해제하고 저장한 뒤 다시 열어 주세요.');
    }
    var d = stream(cfb, 'PowerPoint Document');
    if (!d) throw fail('INVALID', 'PowerPoint 문서가 아닙니다.');

    var slides = []; // { title: [], body: [] }
    var slideContainers = [];

    walk(d, 0, d.length, function (h, bodyStart, bodyEnd) {
      if (h.type === RT.DOCUMENT) return false;

      if (h.type === RT.SLIDE_LIST) {
        if (h.instance !== 0) return true; // 마스터(1)·노트(2)는 건너뛴다.
        var current = null;
        var kind = null;
        walk(d, bodyStart, bodyEnd, function (rec, s, e) {
          if (rec.type === RT.SLIDE_PERSIST) {
            current = { title: [], body: [] };
            slides.push(current);
            kind = null;
          } else if (rec.type === RT.TEXT_HEADER) {
            kind = new DataView(d.buffer, d.byteOffset + s, 4).getUint32(0, true);
          } else if ((rec.type === RT.TEXT_CHARS || rec.type === RT.TEXT_BYTES) && current) {
            var bucket = TITLE_TYPES[kind] ? current.title : current.body;
            decodeText(d, rec, s, e).forEach(function (line) {
              if (line.trim()) bucket.push(line);
            });
          }
          return false;
        });
        return true;
      }

      if (h.type === RT.SLIDE) {
        var extra = { title: [], body: [] };
        var shapeKind = null;
        walk(d, bodyStart, bodyEnd, function (rec, s, e) {
          if (rec.type === RT.CLIENT_TEXTBOX) shapeKind = null; // 도형마다 TextHeaderAtom이 새로 온다.
          if (rec.type === RT.TEXT_HEADER) {
            shapeKind = new DataView(d.buffer, d.byteOffset + s, 4).getUint32(0, true);
          } else if (rec.type === RT.TEXT_CHARS || rec.type === RT.TEXT_BYTES) {
            var bucket = TITLE_TYPES[shapeKind] ? extra.title : extra.body;
            decodeText(d, rec, s, e).forEach(function (line) {
              if (line.trim()) bucket.push(line);
            });
          }
          return false;
        });
        slideContainers.push(extra);
        return true;
      }
      return false;
    });

    // 플레이스홀더 텍스트가 없는 파일이면 Slide 컨테이너 개수만큼 슬라이드를 만든다.
    while (slides.length < slideContainers.length) slides.push({ title: [], body: [] });
    slides.forEach(function (slide, i) {
      var extra = slideContainers[i];
      if (!extra) return;
      slide.title = slide.title.concat(extra.title);
      slide.body = slide.body.concat(extra.body);
    });
    return slides;
  }

  var api = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PptText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
