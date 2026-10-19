// 실제 GitHub 릴리스를 대상으로 업데이트 경로를 점검한다.
//
//   flutter test --dart-define=LIVE_RELEASE_TEST=true \
//     --dart-define=GITHUB_REPO=owner/repo test/live_release_test.dart
//
// 네트워크가 필요하고 릴리스 상태에 의존하므로 기본 실행에서는 건너뛴다.
import 'dart:io';

import 'package:docviewer/src/config.dart';
import 'package:docviewer/src/update/update_service.dart';
import 'package:flutter_test/flutter_test.dart';

const _enabled = bool.fromEnvironment('LIVE_RELEASE_TEST');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // flutter_test는 HttpClient를 가로채므로 실제 네트워크를 쓰려면 해제해야 한다.
  HttpOverrides.global = null;

  test('릴리스 채널에서 최신 릴리스를 읽고 APK 자산을 찾는다', () async {
    if (!_enabled || !AppConfig.hasReleaseChannel) {
      markTestSkipped('LIVE_RELEASE_TEST/GITHUB_REPO dart-define이 없어 건너뜁니다.');
      return;
    }

    final outdated = UpdateService(
      currentVersionProvider: () async => '0.0.1',
    );
    addTearDown(outdated.dispose);
    final release = await outdated.checkForUpdate();

    expect(release, isNotNull, reason: '릴리스가 하나 이상 있어야 합니다.');
    expect(release!.tag, matches(RegExp(r'^v?\d+\.\d+\.\d+')));
    expect(release.apkUrl, isNotNull, reason: 'APK 자산이 필요합니다.');
    expect(release.apkUrl, endsWith('.apk'));
    // ignore: avoid_print
    print('릴리스 ${release.tag} → ${release.apkUrl}');

    // 최신 버전을 쓰는 기기에는 업데이트를 안내하지 않는다.
    final upToDate = UpdateService(
      currentVersionProvider: () async => release.version,
    );
    addTearDown(upToDate.dispose);
    expect(await upToDate.checkForUpdate(), isNull);
  });
}
