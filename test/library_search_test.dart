import 'dart:convert';
import 'dart:io';

import 'package:docviewer/src/document.dart';
import 'package:docviewer/src/library_search.dart';
import 'package:docviewer/src/reader/text_decoder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory dir;
  setUp(() => dir = Directory.systemTemp.createTempSync('library_search_test'));
  tearDown(() => dir.deleteSync(recursive: true));

  DocumentFile write(String name, List<int> bytes) {
    final file = File('${dir.path}/$name')..writeAsBytesSync(bytes);
    return DocumentFile(path: file.path, name: name, size: bytes.length);
  }

  test('snippetAround: 단어 주변만 잘라 한 줄로 만든다', () {
    const text = 'aaaa\n  bbbb moonlight cccc\ndddd';
    final snippet = snippetAround(text, text.indexOf('moonlight'), 9, before: 5, after: 6);
    expect(snippet, '…bbbb moonlight cccc…');
    expect(snippetAround('짧은 글', 0, 1), '짧은 글');
  });

  test('파일명 검색: 본문 포함을 끄면 본문은 보지 않는다', () async {
    final docs = [
      write('moonlight_notes.txt', utf8.encode('아무 내용')),
      write('diary.txt', utf8.encode('어젯밤 달빛 moonlight 이 좋았다')),
      write('report.pdf', utf8.encode('%PDF moonlight')),
    ];
    final results = await searchDocuments(docs, 'MOONLIGHT', includeBody: false);
    expect(results.map((r) => r.document.name), ['moonlight_notes.txt']);
    expect(results.single.snippet, isNull);
  });

  test('본문 포함: 파일명 일치가 먼저, 본문 일치는 미리보기와 함께, 텍스트 아닌 형식은 건너뜀', () async {
    final docs = [
      write('diary.txt', utf8.encode('어젯밤 달빛 moonlight 이 좋았다')),
      write('moonlight_notes.txt', utf8.encode('아무 내용')),
      write('report.pdf', utf8.encode('%PDF moonlight')),
      write('other.txt', utf8.encode('관련 없는 글')),
    ];
    final results = await searchDocuments(docs, 'moonlight', includeBody: true);
    expect(results.map((r) => r.document.name), ['moonlight_notes.txt', 'diary.txt']);
    expect(results.last.snippet, contains('moonlight'));
  });

  test('CP949 파일의 본문도 검색된다', () async {
    // "달빛" = CP949 B4 DE BA FB
    final doc = write('euckr.txt', [0xB4, 0xDE, 0xBA, 0xFB, 0x20, 0x41, 0x42]);
    final results = await searchDocuments([doc], '달빛', includeBody: true);
    expect(results, hasLength(1));
    expect(results.single.snippet, '달빛 AB');
  });

  test('readTextFile: CP949와 UTF-8 BOM을 자동 판별', () async {
    final cp949 = File('${dir.path}/a.txt')..writeAsBytesSync([0xC7, 0xD1, 0xB1, 0xDB]); // 한글
    expect(await readTextFile(cp949), '한글');
    final bom = File('${dir.path}/b.txt')..writeAsBytesSync([0xEF, 0xBB, 0xBF, ...utf8.encode('한글')]);
    expect(await readTextFile(bom), '한글');
  });

  test('빈 검색어와 사라진 파일은 안전하게 처리', () async {
    expect(await searchDocuments([], '  ', includeBody: true), isEmpty);
    const gone = DocumentFile(path: '/없는/파일.txt', name: '파일.txt', size: 1);
    expect(await searchDocuments([gone], '없는내용', includeBody: true), isEmpty);
  });
}
