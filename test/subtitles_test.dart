import 'package:docviewer/src/document.dart';
import 'package:docviewer/src/media/subtitles.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SAMI 자막을 SRT로 바꾼다(한국어 클래스 우선, &nbsp; 는 지움 표시)', () {
    const smi = '''
<SAMI><HEAD><STYLE>.KRCC {Name:Korean;} .ENCC {Name:English;}</STYLE></HEAD>
<BODY>
<SYNC Start=1000><P Class=KRCC>안녕하세요<br>반갑습니다
<SYNC Start=1000><P Class=ENCC>Hello
<SYNC Start=3500><P Class=KRCC>&nbsp;
<SYNC Start=5000><P Class=KRCC><font color="#ffff00">두 번째</font> 자막
</BODY></SAMI>
''';
    final srt = samiToSrt(smi);
    expect(srt, contains('1\n00:00:01,000 --> 00:00:03,500\n안녕하세요\n반갑습니다'));
    expect(srt, contains('2\n00:00:05,000 --> 00:00:09,000\n두 번째 자막'));
    expect(srt, isNot(contains('Hello')));
  });

  test('SAMI 판별', () {
    expect(looksLikeSami('<SAMI><BODY><SYNC Start=0>'), isTrue);
    expect(looksLikeSami('1\n00:00:01,000 --> 00:00:02,000\nhi'), isFalse);
  });

  test('동영상·음악 확장자를 판별한다', () {
    expect(DocumentFormat.fromFileName('영화.MKV'), DocumentFormat.video);
    expect(DocumentFormat.fromFileName('a.mp4'), DocumentFormat.video);
    expect(DocumentFormat.fromFileName('노래.flac'), DocumentFormat.audio);
    expect(
      const DocumentFile(path: 'content://x', name: 'b.mp3', size: 1).isMedia,
      isTrue,
    );
    expect(
      const DocumentFile(path: '/a.pdf', name: 'a.pdf', size: 1).isMedia,
      isFalse,
    );
  });
}
