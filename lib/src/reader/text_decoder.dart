import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';

/// CP949 변환표(assets/cp949.bin, tool/make_cp949.py로 생성)를 한 번만 읽어 둔다.
Uint8List? _cp949Table;

Future<Uint8List> _loadCp949() async {
  final cached = _cp949Table;
  if (cached != null) return cached;
  final data = await rootBundle.load('assets/cp949.bin');
  return _cp949Table = data.buffer.asUint8List(
    data.offsetInBytes,
    data.lengthInBytes,
  );
}

/// 텍스트 파일을 읽어 문자열로 돌려준다. 인코딩은 자동으로 판별한다.
Future<String> readTextFile(File file) async {
  final bytes = await file.readAsBytes();
  return decodeText(bytes, await _loadCp949());
}

/// BOM → 엄격한 UTF-8 → CP949 순으로 판별한다.
///
/// 한국어 텍스트 파일은 UTF-8이 아니라 CP949(EUC-KR)인 경우가 흔하다.
/// 앞의 두 가지가 아니면 CP949로 본다.
String decodeText(Uint8List bytes, Uint8List cp949Table) {
  if (bytes.length >= 3 &&
      bytes[0] == 0xEF &&
      bytes[1] == 0xBB &&
      bytes[2] == 0xBF) {
    return utf8.decode(bytes.sublist(3), allowMalformed: true);
  }
  if (bytes.length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE) {
    return _decodeUtf16(bytes, 2, Endian.little);
  }
  if (bytes.length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF) {
    return _decodeUtf16(bytes, 2, Endian.big);
  }
  try {
    return utf8.decode(bytes);
  } on FormatException {
    return decodeCp949(bytes, cp949Table);
  }
}

String _decodeUtf16(Uint8List bytes, int start, Endian endian) {
  final view = ByteData.sublistView(bytes);
  final units = <int>[];
  for (var i = start; i + 1 < bytes.length; i += 2) {
    units.add(view.getUint16(i, endian));
  }
  return String.fromCharCodes(units);
}

/// CP949 바이트열을 디코딩한다. 변환표에 없는 코드는 U+FFFD로 둔다.
String decodeCp949(Uint8List bytes, Uint8List table) {
  final out = StringBuffer();
  final view = ByteData.sublistView(table);
  var i = 0;
  while (i < bytes.length) {
    final b = bytes[i];
    if (b < 0x80) {
      out.writeCharCode(b);
      i++;
      continue;
    }
    if (b >= 0x81 && b <= 0xFE && i + 1 < bytes.length) {
      final t = bytes[i + 1];
      if (t >= 0x41 && t <= 0xFE) {
        final code = view.getUint16(
          ((b - 0x81) * 190 + (t - 0x41)) * 2,
          Endian.little,
        );
        out.writeCharCode(code == 0 ? 0xFFFD : code);
        i += 2;
        continue;
      }
    }
    out.writeCharCode(0xFFFD);
    i++;
  }
  return out.toString();
}
