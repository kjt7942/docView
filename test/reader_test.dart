import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:docviewer/src/reader/reader_settings.dart';
import 'package:docviewer/src/reader/reader_store.dart';
import 'package:docviewer/src/reader/reader_text.dart';
import 'package:docviewer/src/reader/text_decoder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('decodeText', () {
    final table = File('assets/cp949.bin').readAsBytesSync();

    test('UTF-8(BOM 유무)을 읽는다', () {
      expect(decodeText(Uint8List.fromList(utf8.encode('한글 abc')), table), '한글 abc');
      expect(decodeText(Uint8List.fromList([0xEF, 0xBB, 0xBF, ...utf8.encode('한글')]), table), '한글');
    });

    test('CP949(EUC-KR 확장)를 읽는다', () {
      // "한글 테스트 ABC" — 완성형 + 확장 한글(똠), 한자, 특수문자
      final bytes = Uint8List.fromList([
        0xC7, 0xD1, 0xB1, 0xDB, 0x20, // 한글
        0xB5, 0xB0, 0x20, // 완성형 한 글자
        0x41, 0x42, 0x43, 0x0A,
        0x8C, 0x63, // 확장 영역(UHC)의 한글
        0xE0, 0xA1, // 한자
        0xA1, 0xA4, // 특수문자(·)
      ]);
      final text = decodeText(bytes, table);
      expect(text.startsWith('한글 '), isTrue);
      expect(text.contains('ABC\n'), isTrue);
      expect(text.contains('�'), isFalse);
      expect(text.codeUnitAt(text.length - 1), 0x00B7);
    });

    test('UTF-16 BOM을 읽는다', () {
      final le = Uint8List.fromList([0xFF, 0xFE, 0x5C, 0xD5, 0x00, 0xAE]); // 한글(LE)
      expect(decodeText(le, table), '한글');
      final be = Uint8List.fromList([0xFE, 0xFF, 0xD5, 0x5C, 0xAE, 0x00]);
      expect(decodeText(be, table), '한글');
    });

    test('CP949 변환표가 한글 11172자 중 UHC 영역까지 채워져 있다', () {
      // 앞 0x81~0xC6 × 뒤 0x41~0xFE 안에 매핑이 8000개 이상 있어야 한다(완성형 2350 + 확장 8822 중 일부).
      var mapped = 0;
      for (var i = 0; i < table.length; i += 2) {
        if (table[i] != 0 || table[i + 1] != 0) mapped++;
      }
      expect(mapped, greaterThan(15000));
    });
  });

  group('ReaderText.build', () {
    test('개행 제거 끔: 줄마다 문단, 빈 줄도 유지', () {
      final t = ReaderText.build('가\n\n나', joinLines: false);
      expect(t.paragraphs, ['가', '', '나']);
      expect(t.starts, [0, 2, 3]);
    });

    test('개행 제거: 문장 부호 없이 꺾인 줄을 이어 붙인다', () {
      final t = ReaderText.build('오늘은 날씨가\n맑고 화창했다.\n내일은 비가\n온다고 한다.', joinLines: true);
      expect(t.paragraphs, ['오늘은 날씨가 맑고 화창했다.', '내일은 비가 온다고 한다.']);
      expect(t.starts, [0, 17]); // 첫 문단 두 줄: 8자 + 9자(줄바꿈 포함)
    });

    test('개행 제거: 빈 줄과 들여쓰기는 문단 경계', () {
      final t = ReaderText.build('첫 문단 줄1\n줄2\n\n둘째 문단\n　들여쓴 문단', joinLines: true);
      expect(t.paragraphs, ['첫 문단 줄1 줄2', '둘째 문단', '　들여쓴 문단']);
    });

    test('개행 제거: 한자·가나 사이에는 공백을 넣지 않는다', () {
      final t = ReaderText.build('日本語の\nテキスト', joinLines: true);
      expect(t.paragraphs, ['日本語の テキスト'.replaceAll(' ', '')]);
    });

    test('CRLF와 빈 입력', () {
      expect(ReaderText.build('a\r\nb', joinLines: false).paragraphs, ['a', 'b']);
      final empty = ReaderText.build('', joinLines: true);
      expect(empty.paragraphs, ['']);
      expect(empty.starts, [0]);
    });

    test('paragraphIndexAt: 원문 위치로 문단을 찾는다', () {
      final t = ReaderText.build('aaa\nbbb\nccc', joinLines: false); // starts 0,4,8
      expect(t.paragraphIndexAt(0), 0);
      expect(t.paragraphIndexAt(3), 0);
      expect(t.paragraphIndexAt(4), 1);
      expect(t.paragraphIndexAt(9), 2);
      expect(t.paragraphIndexAt(999), 2);
    });

    test('개행 제거를 바꿔도 같은 원문 위치로 돌아온다', () {
      const raw = '줄1\n줄2\n\n줄3\n줄4';
      final split = ReaderText.build(raw, joinLines: false);
      final joined = ReaderText.build(raw, joinLines: true);
      final offset = split.starts[split.paragraphIndexAt(raw.indexOf('줄3'))];
      expect(joined.paragraphs[joined.paragraphIndexAt(offset)], '줄3 줄4');
    });
  });

  group('검색', () {
    test('대소문자를 구분하지 않고 문단·위치를 돌려준다', () {
      final t = ReaderText.build('Hello hello\nworld\nHELLO', joinLines: false);
      final hits = t.search('hello');
      expect(hits.map((h) => [h.paragraph, h.start]).toList(), [
        [0, 0],
        [0, 6],
        [2, 0],
      ]);
      expect(t.search(''), isEmpty);
      expect(t.search('없는말'), isEmpty);
    });

    test('limit로 결과 수를 제한한다', () {
      final t = ReaderText.build('a' * 100, joinLines: false);
      expect(t.search('a', limit: 10), hasLength(10));
    });
  });

  group('ReaderSettings', () {
    test('JSON 왕복', () {
      const s = ReaderSettings(fontSize: 22, font: '명조', joinLines: true, blueLight: 0.4, pageRatio: 0.7);
      final back = ReaderSettings.fromJson(s.toJson());
      expect(back.fontSize, 22);
      expect(back.font, '명조');
      expect(back.joinLines, isTrue);
      expect(back.blueLight, 0.4);
      expect(back.pageRatio, 0.7);
    });

    test('범위를 벗어나거나 잘못된 값은 안전하게 보정', () {
      final s = ReaderSettings.fromJson({'fontSize': 9999, 'font': '없는글꼴', 'dim': 'x', 'pageRatio': -3});
      expect(s.fontSize, 60);
      expect(s.font, '고딕');
      expect(s.dim, 0);
      expect(s.pageRatio, 0.2);
    });

    test('sameLayoutAs: 색은 레이아웃에 영향이 없고 글자 크기는 있다', () {
      const a = ReaderSettings();
      expect(a.sameLayoutAs(a.copyWith(background: 0xFF000000, blueLight: 0.5, pageRatio: 0.5)), isTrue);
      expect(a.sameLayoutAs(a.copyWith(fontSize: 20)), isFalse);
      expect(a.sameLayoutAs(a.copyWith(joinLines: true)), isFalse);
    });
  });

  group('ReaderStore', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('reader_store_test'));
    tearDown(() => dir.deleteSync(recursive: true));

    test('저장했다가 다시 읽는다(설정·위치·책갈피·최근 문서)', () async {
      final file = File('${dir.path}/state.json');
      final store = ReaderStore(file);
      final key = ReaderStore.keyFor('소설.txt', 1234);
      store.settings = const ReaderSettings(fontSize: 25);
      store.positions[key] = 777;
      store.bookmarksOf(key).add(const Bookmark(offset: 42, label: '여기', createdAt: 1));
      store.addRecent(const RecentEntry(path: '/a/소설.txt', name: '소설.txt', size: 1234, openedAt: 5));
      await store.save();

      final again = ReaderStore(file);
      await again.load();
      expect(again.settings.fontSize, 25);
      expect(again.positions[key], 777);
      expect(again.bookmarksOf(key).single.label, '여기');
      expect(again.recents.single.name, '소설.txt');
    });

    test('같은 문서를 다시 열면 최근 목록 맨 앞으로 올라오고 중복되지 않는다', () {
      final store = ReaderStore(File('${dir.path}/x.json'));
      store.addRecent(const RecentEntry(path: '/1', name: 'a.txt', size: 1, openedAt: 1));
      store.addRecent(const RecentEntry(path: '/2', name: 'b.txt', size: 1, openedAt: 2));
      store.addRecent(const RecentEntry(path: '/3', name: 'a.txt', size: 1, openedAt: 3));
      expect(store.recents.map((r) => r.path), ['/3', '/2']);
    });

    test('손상된 파일은 기본값으로 시작한다', () async {
      final file = File('${dir.path}/bad.json')..writeAsStringSync('{ 깨짐');
      final store = ReaderStore(file);
      await store.load();
      expect(store.settings.fontSize, const ReaderSettings().fontSize);
      expect(store.recents, isEmpty);
    });
  });
}
