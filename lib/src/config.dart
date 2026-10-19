/// 앱 배포/업데이트 관련 설정.
///
/// 릴리스 시 `--dart-define=GITHUB_REPO=owner/repo`로 실제 저장소를 주입한다.
/// 값이 비어 있으면 업데이트 확인을 건너뛴다(개발 빌드).
class AppConfig {
  const AppConfig._();

  static const String githubRepo = String.fromEnvironment(
    'GITHUB_REPO',
    defaultValue: '',
  );

  static bool get hasReleaseChannel => githubRepo.contains('/');

  static String get latestReleaseApi =>
      'https://api.github.com/repos/$githubRepo/releases/latest';

  static String get releasesPageUrl =>
      'https://github.com/$githubRepo/releases/latest';
}
