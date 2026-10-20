import 'package:docviewer/src/app.dart';
import 'package:docviewer/src/document.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DocumentFormat.fromFileName', () {
    test('확장자로 포맷을 판별한다', () {
      expect(DocumentFormat.fromFileName('보고서.PDF'), DocumentFormat.pdf);
      expect(DocumentFormat.fromFileName('계약서.docx'), DocumentFormat.word);
      expect(DocumentFormat.fromFileName('정산.xlsx'), DocumentFormat.excel);
      expect(DocumentFormat.fromFileName('발표.pptx'), DocumentFormat.powerpoint);
      expect(DocumentFormat.fromFileName('공문.hwp'), DocumentFormat.hwp);
      expect(DocumentFormat.fromFileName('메모.txt'), DocumentFormat.text);
    });

    test('구형 doc/ppt와 hwpx도 웹 렌더러로 연다', () {
      DocumentFile file(String name) => DocumentFile(path: '/x/$name', name: name, size: 1);
      expect(file('옛문서.DOC').webKind, 'doc');
      expect(file('옛발표.ppt').webKind, 'ppt');
      expect(file('공문.hwpx').webKind, 'hwpx');
      expect(file('README.md').webKind, 'markdown');
      expect(file('압축.zip').webKind, isNull);
    });

    test('확장자가 없거나 모르는 형식은 unknown', () {
      expect(DocumentFormat.fromFileName('README'), DocumentFormat.unknown);
      expect(DocumentFormat.fromFileName('archive.zip'), DocumentFormat.unknown);
      expect(DocumentFormat.fromFileName('끝.'), DocumentFormat.unknown);
    });
  });

  testWidgets('첫 화면에 문서 열기 버튼이 보인다', (tester) async {
    await tester.pumpWidget(const DocViewerApp());

    expect(find.text('광고 없이, 필요한 것만'), findsOneWidget);
    expect(find.text('문서 열기'), findsOneWidget);
  });
}
