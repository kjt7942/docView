import 'package:docviewer/src/update/update_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('isNewerVersion', () {
    test('패치/마이너/메이저 버전을 순서대로 비교한다', () {
      expect(isNewerVersion('1.0.1', '1.0.0'), isTrue);
      expect(isNewerVersion('1.1.0', '1.0.9'), isTrue);
      expect(isNewerVersion('2.0.0', '1.9.9'), isTrue);
      expect(isNewerVersion('1.0.0', '1.0.1'), isFalse);
      expect(isNewerVersion('1.0.0', '1.0.0'), isFalse);
    });

    test('v 접두사와 빌드 번호를 무시한다', () {
      expect(isNewerVersion('v1.2.0', '1.1.0+3'), isTrue);
      expect(isNewerVersion('1.0.0+5', 'v1.0.0'), isFalse);
    });

    test('자릿수가 다른 버전도 숫자로 비교한다', () {
      expect(isNewerVersion('1.10.0', '1.9.0'), isTrue);
      expect(isNewerVersion('1.0', '1.0.0'), isFalse);
    });
  });
}
