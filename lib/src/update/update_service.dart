import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import '../config.dart';

/// GitHub Releases에서 읽어온 배포 정보.
class AppRelease {
  const AppRelease({
    required this.version,
    required this.tag,
    required this.notes,
    required this.pageUrl,
    required this.apkUrl,
  });

  /// 태그에서 앞의 v를 뗀 버전. 예: `v1.2.0` -> `1.2.0`
  final String version;
  final String tag;
  final String notes;
  final String pageUrl;
  final String? apkUrl;

  bool get canInstallInApp => Platform.isAndroid && apkUrl != null;
}

/// GitHub Releases API를 이용한 업데이트 확인/다운로드.
///
/// 서버가 필요 없고, 광고/추적도 없다. 릴리스 태그가 곧 버전이 된다.
class UpdateService {
  UpdateService({
    http.Client? client,
    Future<String> Function()? currentVersionProvider,
    String? apiUrl,
  }) : _client = client ?? http.Client(),
       _currentVersionProvider = currentVersionProvider ?? _platformVersion,
       _apiUrl =
           apiUrl ??
           (AppConfig.hasReleaseChannel ? AppConfig.latestReleaseApi : null);

  final http.Client _client;
  final Future<String> Function() _currentVersionProvider;

  /// null이면 업데이트 채널이 설정되지 않은 빌드다(개발 빌드).
  final String? _apiUrl;

  static Future<String> _platformVersion() async {
    final info = await PackageInfo.fromPlatform();
    return info.version;
  }

  /// 최신 릴리스가 현재 버전보다 새로울 때만 [AppRelease]를 돌려준다.
  ///
  /// 네트워크 오류는 호출자에게 던진다. 업데이트는 부가 기능이므로
  /// 호출부에서 조용히 무시할 수 있게 하기 위함이다.
  Future<AppRelease?> checkForUpdate() async {
    final apiUrl = _apiUrl;
    if (apiUrl == null) return null;

    final response = await _client.get(
      Uri.parse(apiUrl),
      headers: const {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    ).timeout(const Duration(seconds: 10));

    if (response.statusCode == 404) return null;
    if (response.statusCode != 200) {
      throw HttpException('GitHub API ${response.statusCode}');
    }

    final json = jsonDecode(utf8.decode(response.bodyBytes));
    if (json is! Map<String, dynamic>) return null;

    final tag = (json['tag_name'] as String?)?.trim() ?? '';
    if (tag.isEmpty) return null;
    final version = tag.replaceFirst(RegExp(r'^[vV]'), '');

    final currentVersion = await _currentVersionProvider();
    if (!isNewerVersion(version, currentVersion)) return null;

    String? apkUrl;
    final assets = json['assets'];
    if (assets is List) {
      for (final asset in assets) {
        if (asset is! Map) continue;
        final name = (asset['name'] as String?)?.toLowerCase() ?? '';
        if (!name.endsWith('.apk')) continue;
        apkUrl = asset['browser_download_url'] as String?;
        if (apkUrl != null) break;
      }
    }

    return AppRelease(
      version: version,
      tag: tag,
      notes: (json['body'] as String?)?.trim() ?? '',
      pageUrl: (json['html_url'] as String?) ?? AppConfig.releasesPageUrl,
      apkUrl: apkUrl,
    );
  }

  /// APK를 캐시 디렉터리에 내려받고 진행률(0~1)을 알려준다.
  Future<File> downloadApk(
    String url, {
    void Function(double progress)? onProgress,
  }) async {
    final request = http.Request('GET', Uri.parse(url));
    final response = await _client.send(request).timeout(
      const Duration(seconds: 30),
    );
    if (response.statusCode != 200) {
      throw HttpException('다운로드 실패 ${response.statusCode}');
    }

    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/docviewer-update.apk');
    if (await file.exists()) await file.delete();

    final sink = file.openWrite();
    final total = response.contentLength ?? 0;
    var received = 0;
    try {
      await for (final chunk in response.stream) {
        sink.add(chunk);
        received += chunk.length;
        if (total > 0) onProgress?.call(received / total);
      }
    } finally {
      await sink.close();
    }
    onProgress?.call(1);
    return file;
  }

  void dispose() => _client.close();
}

/// `1.2.10` > `1.2.9` 같은 비교. 숫자 3자리까지만 본다.
bool isNewerVersion(String candidate, String current) {
  List<int> parse(String value) {
    final core = value
        .replaceFirst(RegExp(r'^[vV]'), '')
        .split(RegExp(r'[^0-9]'))
        .where((part) => part.isNotEmpty)
        .toList();
    return [
      for (var i = 0; i < 3; i++)
        i < core.length ? (int.tryParse(core[i]) ?? 0) : 0,
    ];
  }

  final a = parse(candidate);
  final b = parse(current);
  for (var i = 0; i < 3; i++) {
    if (a[i] != b[i]) return a[i] > b[i];
  }
  return false;
}
