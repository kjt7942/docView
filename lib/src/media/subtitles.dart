import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../reader/text_decoder.dart';

/// 플레이어에 넣을 수 있게 자막 파일을 UTF-8로 바꿔 임시 폴더에 저장하고 경로를 돌려준다.
///
/// - 인코딩(UTF-8/CP949/UTF-16)은 자동 판별한다. 한국 자막은 CP949인 경우가 많다.
/// - SMI(SAMI)는 재생 엔진이 읽지 못하므로 SRT로 변환한다.
/// - SRT/ASS/SSA/VTT/SUB 등은 그대로(UTF-8로만 바꿔) 넘긴다.
Future<String> prepareSubtitle(File source) async {
  final name = source.path.split(Platform.pathSeparator).last;
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? 'srt' : name.substring(dot + 1).toLowerCase();
  final text = await readTextFile(source);

  final isSami = ext == 'smi' || ext == 'sami' || looksLikeSami(text);
  final output = isSami ? samiToSrt(text) : text;
  final outExt = isSami ? 'srt' : ext;

  final dir = Directory('${(await getTemporaryDirectory()).path}/subtitles');
  await dir.create(recursive: true);
  final file = File(
    '${dir.path}/sub_${DateTime.now().millisecondsSinceEpoch}.$outExt',
  );
  await file.writeAsString(output, encoding: utf8);
  return file.path;
}

bool looksLikeSami(String text) {
  final head = text.length > 2000 ? text.substring(0, 2000) : text;
  return RegExp(r'<\s*sami\b', caseSensitive: false).hasMatch(head) ||
      RegExp(r'<\s*sync\s+start', caseSensitive: false).hasMatch(head);
}

/// SAMI(.smi) 자막을 SRT 문자열로 바꾼다.
///
/// 여러 언어 클래스(KRCC, ENCC 등)가 있으면 한국어 → 첫 번째 클래스 순으로 하나만 고른다.
/// `&nbsp;`만 있는 SYNC는 앞 자막을 지우는 표시로 보고 자막 사이 빈칸으로 처리한다.
String samiToSrt(String sami) {
  final syncRe = RegExp(
    r'<\s*sync\s+start\s*=\s*"?(-?\d+)[^>]*>',
    caseSensitive: false,
  );
  final matches = syncRe.allMatches(sami).toList();
  if (matches.isEmpty) return '';

  // 언어 클래스 고르기.
  final classes = <String>[];
  for (final m in RegExp(
    r'<\s*p\s+class\s*=\s*"?([A-Za-z0-9_-]+)',
    caseSensitive: false,
  ).allMatches(sami)) {
    final c = m.group(1)!.toUpperCase();
    if (!classes.contains(c)) classes.add(c);
  }
  String? chosen;
  if (classes.length > 1) {
    chosen = classes.firstWhere(
      (c) => c.startsWith('KR') || c.startsWith('KO'),
      orElse: () => classes.first,
    );
  }

  final cues = <({int start, String text})>[];
  for (var i = 0; i < matches.length; i++) {
    final start = int.parse(matches[i].group(1)!);
    final bodyEnd = i + 1 < matches.length ? matches[i + 1].start : sami.length;
    var body = sami.substring(matches[i].end, bodyEnd);
    body = body.replaceAll(
      RegExp(r'<\s*/\s*(body|sami)\s*>.*', caseSensitive: false, dotAll: true),
      '',
    );
    if (chosen != null) {
      // 고른 언어의 <P> 부분만 남긴다.
      final parts = body.split(RegExp(r'(?=<\s*p[\s>])', caseSensitive: false));
      final keep = parts.where((p) {
        final m = RegExp(
          r'<\s*p\s+class\s*=\s*"?([A-Za-z0-9_-]+)',
          caseSensitive: false,
        ).firstMatch(p);
        return m == null ? false : m.group(1)!.toUpperCase() == chosen;
      }).toList();
      body = keep.join();
    }
    cues.add((start: start, text: _samiText(body)));
  }
  cues.sort((a, b) => a.start.compareTo(b.start));

  final out = StringBuffer();
  var index = 1;
  for (var i = 0; i < cues.length; i++) {
    final cue = cues[i];
    if (cue.text.isEmpty) continue;
    var end = i + 1 < cues.length ? cues[i + 1].start : cue.start + 4000;
    if (end <= cue.start) end = cue.start + 1000;
    out
      ..writeln(index++)
      ..writeln('${_srtTime(cue.start)} --> ${_srtTime(end)}')
      ..writeln(cue.text)
      ..writeln();
  }
  return out.toString();
}

String _samiText(String html) {
  var s = html
      .replaceAll(RegExp(r'<\s*br\s*/?\s*>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<!--.*?-->', dotAll: true), '')
      .replaceAll(RegExp(r'<[^>]*>'), '')
      .replaceAll(RegExp(r'&nbsp;?', caseSensitive: false), ' ')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&amp;', '&');
  s = s
      .split('\n')
      .map((l) => l.replaceAll(RegExp(r'[ \t\r]+'), ' ').trim())
      .where((l) => l.isNotEmpty)
      .join('\n');
  return s;
}

String _srtTime(int ms) {
  if (ms < 0) ms = 0;
  final h = ms ~/ 3600000;
  final m = (ms ~/ 60000) % 60;
  final s = (ms ~/ 1000) % 60;
  final r = ms % 1000;
  String two(int v) => v.toString().padLeft(2, '0');
  return '${two(h)}:${two(m)}:${two(s)},${r.toString().padLeft(3, '0')}';
}
