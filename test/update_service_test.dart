import 'dart:convert';

import 'package:docviewer/src/config.dart';
import 'package:docviewer/src/update/update_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _apiUrl = 'https://example.test/repos/owner/repo/releases/latest';

String _releaseJson({
  required String tag,
  String? apkUrl = 'https://example.test/docviewer.apk',
  String notes = '변경 사항',
}) {
  return jsonEncode({
    'tag_name': tag,
    'body': notes,
    'html_url': 'https://example.test/releases/tag/$tag',
    'assets': [
      {'name': 'checksums.txt', 'browser_download_url': 'https://example.test/sums.txt'},
      if (apkUrl != null) {'name': 'docviewer.apk', 'browser_download_url': apkUrl},
    ],
  });
}

UpdateService _serviceFor(
  String version, {
  required String body,
  int status = 200,
  void Function(http.Request request)? onRequest,
}) {
  return UpdateService(
    apiUrl: _apiUrl,
    currentVersionProvider: () async => version,
    client: MockClient((request) async {
      onRequest?.call(request);
      return http.Response(
        body,
        status,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }),
  );
}

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

  group('UpdateService.checkForUpdate', () {
    test('새 버전이면 릴리스 정보와 APK URL을 돌려준다', () async {
      late http.Request seen;
      final service = _serviceFor(
        '1.0.0',
        body: _releaseJson(tag: 'v1.2.0', notes: 'PDF 확대 개선'),
        onRequest: (request) => seen = request,
      );

      final release = await service.checkForUpdate();

      expect(seen.url.toString(), _apiUrl);
      expect(seen.headers['Accept'], 'application/vnd.github+json');
      expect(release, isNotNull);
      expect(release!.version, '1.2.0');
      expect(release.tag, 'v1.2.0');
      expect(release.notes, 'PDF 확대 개선');
      expect(release.pageUrl, 'https://example.test/releases/tag/v1.2.0');
      // checksums.txt를 건너뛰고 .apk 자산을 고른다.
      expect(release.apkUrl, 'https://example.test/docviewer.apk');
    });

    test('같은 버전이면 null', () async {
      final service = _serviceFor('1.0.0', body: _releaseJson(tag: 'v1.0.0'));
      expect(await service.checkForUpdate(), isNull);
    });

    test('릴리스가 없으면(404) null', () async {
      final service = _serviceFor('1.0.0', body: '{}', status: 404);
      expect(await service.checkForUpdate(), isNull);
    });

    test('APK 자산이 없으면 설치 불가로 표시한다', () async {
      final service = _serviceFor(
        '1.0.0',
        body: _releaseJson(tag: 'v2.0.0', apkUrl: null),
      );
      final release = await service.checkForUpdate();
      expect(release, isNotNull);
      expect(release!.apkUrl, isNull);
    });

    test('서버 오류는 예외로 올려 호출부가 조용히 무시할 수 있다', () async {
      final service = _serviceFor('1.0.0', body: '{}', status: 500);
      expect(service.checkForUpdate(), throwsA(isA<Object>()));
    });

    test('업데이트 채널이 없는 빌드는 요청하지 않는다', () async {
      // dart-define으로 채널이 주입된 빌드에서는 이 시나리오가 성립하지 않는다.
      if (AppConfig.hasReleaseChannel) return;
      final client = MockClient((_) async => throw StateError('호출되면 안 됨'));
      final service = UpdateService(
        client: client,
        currentVersionProvider: () async => '1.0.0',
      );
      expect(await service.checkForUpdate(), isNull);
    });
  });
}
