/* 암호가 걸린 Office 문서(docx/xlsx/pptx) 복호화. 외부 라이브러리 없이 WebCrypto만 쓴다.
 *
 * 지원: Office 2010 이상의 "Agile" 암호화(MS-OFFCRYPTO 2.3.4.10~15, AES-CBC).
 * 미지원: Office 2007 "Standard" 암호화 — UNSUPPORTED 오류를 던진다.
 * OLE(CFB) 컨테이너 해석은 SheetJS의 XLSX.CFB를 재사용한다.
 */
(function (root) {
  'use strict';

  var HASH = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' };
  // MS-OFFCRYPTO 2.3.4.13 / 2.3.4.12: 용도별 blockKey
  var BLOCK_VERIFIER_INPUT = [0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79];
  var BLOCK_VERIFIER_VALUE = [0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e];
  var BLOCK_KEY_VALUE = [0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6];
  var SEGMENT = 4096;

  function fail(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function cfbOf(bytes) {
    return root.XLSX.CFB.read(bytes, { type: 'array' });
  }

  function streamOf(cfb, name) {
    var entry = root.XLSX.CFB.find(cfb, name);
    return entry && entry.content ? new Uint8Array(entry.content) : null;
  }

  /** OLE 컨테이너 안에 암호화된 OOXML 패키지가 있는지. */
  function isEncryptedPackage(bytes) {
    try {
      var cfb = cfbOf(bytes);
      return !!(streamOf(cfb, 'EncryptionInfo') && streamOf(cfb, 'EncryptedPackage'));
    } catch (e) {
      return false;
    }
  }

  function concat() {
    var len = 0;
    var i;
    for (i = 0; i < arguments.length; i++) len += arguments[i].length;
    var out = new Uint8Array(len);
    var at = 0;
    for (i = 0; i < arguments.length; i++) {
      out.set(arguments[i], at);
      at += arguments[i].length;
    }
    return out;
  }

  function u32(n) {
    var b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  }

  function utf16le(str) {
    var out = new Uint8Array(str.length * 2);
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      out[i * 2] = c & 0xff;
      out[i * 2 + 1] = c >> 8;
    }
    return out;
  }

  function b64(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function digest(alg, data) {
    return new Uint8Array(await crypto.subtle.digest(HASH[alg], data));
  }

  /** 길이를 맞춘다: 길면 자르고 짧으면 pad 바이트로 채운다. */
  function resize(bytes, length) {
    if (bytes.length === length) return bytes;
    if (bytes.length > length) return bytes.slice(0, length);
    var out = new Uint8Array(length).fill(0x36);
    out.set(bytes);
    return out;
  }

  /** WebCrypto는 PKCS7 패딩을 강제하므로, 패딩 블록을 덧붙여 "패딩 없는" CBC 복호화를 흉내 낸다. */
  async function aesCbcDecrypt(keyBytes, iv, data) {
    var key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
    var lastBlock = data.slice(data.length - 16);
    var pad = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: lastBlock }, key, new Uint8Array(0)));
    var plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, key, concat(data, pad.slice(0, 16)));
    return new Uint8Array(plain);
  }

  function parseInfo(info) {
    var major = info[0] | (info[1] << 8);
    var minor = info[2] | (info[3] << 8);
    if (major !== 4 || minor !== 4) {
      throw fail('UNSUPPORTED', '이 암호화 방식은 지원하지 않습니다. (Office 2010 이상 형식만 가능)');
    }
    // 4바이트 버전 + 4바이트 플래그 뒤에 XML이 온다.
    var xml = new TextDecoder('utf-8').decode(info.slice(8));
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    var found = {};
    var all = doc.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var name = all[i].localName;
      if (name === 'keyData' || name === 'encryptedKey') found[name] = all[i];
    }
    if (!found.keyData || !found.encryptedKey) throw fail('UNSUPPORTED', '암호화 정보를 해석할 수 없습니다.');
    function read(el) {
      var cipher = el.getAttribute('cipherAlgorithm');
      if (cipher !== 'AES' || el.getAttribute('cipherChaining') !== 'ChainingModeCBC') {
        throw fail('UNSUPPORTED', '이 암호화 방식은 지원하지 않습니다.');
      }
      var hashAlgorithm = el.getAttribute('hashAlgorithm');
      if (!HASH[hashAlgorithm]) throw fail('UNSUPPORTED', '이 암호화 방식은 지원하지 않습니다.');
      return {
        salt: b64(el.getAttribute('saltValue')),
        blockSize: parseInt(el.getAttribute('blockSize'), 10),
        keyBits: parseInt(el.getAttribute('keyBits'), 10),
        hashAlgorithm: hashAlgorithm,
        spinCount: parseInt(el.getAttribute('spinCount') || '0', 10),
        verifierInput: el.getAttribute('encryptedVerifierHashInput'),
        verifierValue: el.getAttribute('encryptedVerifierHashValue'),
        keyValue: el.getAttribute('encryptedKeyValue'),
      };
    }
    return { data: read(found.keyData), key: read(found.encryptedKey) };
  }

  /** 비밀번호에서 blockKey별 AES 키를 만든다(MS-OFFCRYPTO 2.3.4.11). */
  async function deriveKey(k, passwordHash, blockKey) {
    var h = await digest(k.hashAlgorithm, concat(passwordHash, new Uint8Array(blockKey)));
    return resize(h, k.keyBits / 8);
  }

  /**
   * 암호가 걸린 OLE 컨테이너를 복호화해 평문 OOXML(zip) 바이트를 돌려준다.
   * 비밀번호가 틀리면 code가 BAD_PASSWORD인 오류를 던진다.
   */
  async function decrypt(bytes, password) {
    if (!root.crypto || !root.crypto.subtle) throw fail('UNSUPPORTED', '이 환경에서는 복호화를 지원하지 않습니다.');
    var cfb = cfbOf(bytes);
    var info = streamOf(cfb, 'EncryptionInfo');
    var pkg = streamOf(cfb, 'EncryptedPackage');
    if (!info || !pkg) throw fail('UNSUPPORTED', '암호화된 문서가 아닙니다.');
    var p = parseInfo(info);
    var k = p.key;

    var h = await digest(k.hashAlgorithm, concat(k.salt, utf16le(password)));
    for (var i = 0; i < k.spinCount; i++) {
      h = await digest(k.hashAlgorithm, concat(u32(i), h));
    }

    var iv = resize(k.salt, k.blockSize);
    var verifierInput = await aesCbcDecrypt(await deriveKey(k, h, BLOCK_VERIFIER_INPUT), iv, b64(k.verifierInput));
    var verifierValue = await aesCbcDecrypt(await deriveKey(k, h, BLOCK_VERIFIER_VALUE), iv, b64(k.verifierValue));
    var expected = await digest(k.hashAlgorithm, verifierInput.slice(0, k.salt.length));
    for (var j = 0; j < expected.length; j++) {
      if (expected[j] !== verifierValue[j]) throw fail('BAD_PASSWORD', '비밀번호가 맞지 않습니다.');
    }

    var intermediate = (await aesCbcDecrypt(await deriveKey(k, h, BLOCK_KEY_VALUE), iv, b64(k.keyValue))).slice(
      0,
      k.keyBits / 8,
    );

    var d = p.data;
    var size = new DataView(pkg.buffer, pkg.byteOffset, 8).getUint32(0, true); // 하위 32비트(4GB 미만)
    var body = pkg.subarray(8);
    var parts = [];
    for (var at = 0, index = 0; at < body.length; at += SEGMENT, index++) {
      var chunk = body.slice(at, Math.min(at + SEGMENT, body.length));
      chunk = chunk.slice(0, chunk.length - (chunk.length % 16));
      if (!chunk.length) break;
      var segIv = resize(await digest(d.hashAlgorithm, concat(d.salt, u32(index))), d.blockSize);
      parts.push(await aesCbcDecrypt(intermediate, segIv, chunk));
    }
    return concat.apply(null, parts).slice(0, size);
  }

  var api = { isEncryptedPackage: isEncryptedPackage, decrypt: decrypt };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.OfficeCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
