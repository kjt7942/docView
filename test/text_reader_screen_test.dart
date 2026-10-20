import 'dart:io';

import 'package:docviewer/src/document.dart';
import 'package:docviewer/src/reader/reader_store.dart';
import 'package:docviewer/src/reader/text_reader_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory dir;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('text_reader_test');
    ReaderStore.useForTesting(ReaderStore(File('${dir.path}/state.json')));
  });

  tearDown(() {
    ReaderStore.useForTesting(null);
    try {
      dir.deleteSync(recursive: true);
    } on FileSystemException {
      // 리더가 닫히면서 저장 중인 파일이 Windows에서 잠겨 있을 수 있다. 임시 폴더라 남겨 둬도 된다.
    }
  });

  Future<void> open(WidgetTester tester, String name, String content) async {
    late DocumentFile doc;
    await tester.runAsync(() async {
      final file = File('${dir.path}/$name')..writeAsStringSync(content);
      doc = DocumentFile(path: file.path, name: name, size: file.lengthSync());
    });
    await tester.pumpWidget(MaterialApp(home: TextReaderScreen(document: doc)));
    // 파일 읽기(실제 비동기 I/O)와 문단 높이 측정이 끝나기를 기다린다.
    for (var i = 0; i < 20; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  double scrollOffset(WidgetTester tester) => tester
      .state<ScrollableState>(find.byType(Scrollable).first)
      .position
      .pixels;

  final longText = [for (var i = 1; i <= 200; i++) '$i번째 줄입니다. moonlight $i']
      .join('\n');

  testWidgets('문서를 열면 본문이 보인다', (tester) async {
    await open(tester, 'a.txt', longText);
    expect(find.textContaining('1번째 줄입니다'), findsWidgets);
    expect(find.text('a.txt'), findsOneWidget);
  });

  testWidgets('화면 아래쪽을 누르면 다음 화면으로, 위쪽을 누르면 이전 화면으로 넘어간다', (tester) async {
    await open(tester, 'a.txt', longText);
    final size = tester.view.physicalSize / tester.view.devicePixelRatio;
    expect(scrollOffset(tester), 0);

    // 처음에는 메뉴가 떠 있다가 잠시 뒤 자동으로 숨는다(하단 바가 넘김 영역을 가리지 않게).
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();

    await tester.tapAt(Offset(size.width / 2, size.height - 30));
    await tester.pumpAndSettle();
    final first = scrollOffset(tester);
    expect(first, greaterThan(size.height * 0.5)); // 화면의 90%만큼

    await tester.tapAt(Offset(size.width / 2, size.height - 30));
    await tester.pumpAndSettle();
    expect(scrollOffset(tester), greaterThan(first));

    await tester.tapAt(Offset(size.width / 2, 30));
    await tester.pumpAndSettle();
    expect(scrollOffset(tester), lessThan(first * 2));
  });

  testWidgets('본문 검색: 개수를 보여주고 다음 결과로 이동한다', (tester) async {
    await open(tester, 'a.txt', longText);
    await tester.tap(find.byIcon(Icons.search));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'MOONLIGHT');
    await tester.pumpAndSettle();
    expect(find.textContaining('/200'), findsOneWidget);

    final before = scrollOffset(tester);
    await tester.tap(find.byIcon(Icons.keyboard_arrow_down));
    await tester.pumpAndSettle();
    expect(find.textContaining('2/200'), findsOneWidget);
    expect(scrollOffset(tester), greaterThanOrEqualTo(before));
  });

  testWidgets('뒤로 가기는 검색을 먼저 닫는다', (tester) async {
    await open(tester, 'a.txt', longText);
    await tester.tap(find.byIcon(Icons.search));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNothing); // 검색만 닫히고
    expect(find.byType(TextReaderScreen), findsOneWidget); // 문서는 그대로
  });

  testWidgets('내용이 없는 파일은 안내 문구를 보여준다', (tester) async {
    await open(tester, 'empty.txt', '\n\n\n');
    expect(find.text('내용이 없는 파일입니다.'), findsOneWidget);
  });
}
