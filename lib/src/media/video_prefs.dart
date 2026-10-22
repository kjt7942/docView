import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// 동영상 플레이어 설정(앱을 다시 켜도 유지).
class VideoPrefs {
  VideoPrefs._(this._file);

  final File _file;

  /// 하드웨어 가속(끄면 소프트웨어 디코딩 — 일부 코덱/기기에서 화면이 깨질 때).
  bool hardwareDecoding = true;

  /// 자막 글자 크기(px).
  double subtitleSize = 32;

  /// 자막을 화면 아래에서 얼마나 띄울지(px).
  double subtitleBottom = 24;

  /// 자막 배경 상자.
  bool subtitleBackground = false;

  /// 끝나면 목록의 다음 영상을 이어서 재생.
  bool autoNext = true;

  /// 홈 버튼을 누르면 화면 속 화면(PIP)으로 계속 재생.
  bool autoPip = true;

  /// 영상 비율에 맞춰 화면을 자동으로 가로/세로로 돌리기.
  bool autoRotate = true;

  /// 좌우로 밀어 이동할 때 화면 폭 전체가 몇 초인지.
  int swipeSeekSeconds = 90;

  /// 두 번 탭으로 건너뛰는 시간(초).
  int doubleTapSeconds = 10;

  static VideoPrefs? _instance;

  static Future<VideoPrefs> open() async {
    final cached = _instance;
    if (cached != null) return cached;
    final dir = await getApplicationSupportDirectory();
    final prefs = VideoPrefs._(File('${dir.path}/video_prefs.json'));
    try {
      if (await prefs._file.exists()) {
        final json = jsonDecode(await prefs._file.readAsString());
        if (json is Map<String, dynamic>) prefs._load(json);
      }
    } catch (_) {
      // 손상된 설정은 기본값으로.
    }
    return _instance = prefs;
  }

  void _load(Map<String, dynamic> j) {
    hardwareDecoding = j['hw'] as bool? ?? hardwareDecoding;
    subtitleSize = (j['subSize'] as num?)?.toDouble() ?? subtitleSize;
    subtitleBottom = (j['subBottom'] as num?)?.toDouble() ?? subtitleBottom;
    subtitleBackground = j['subBg'] as bool? ?? subtitleBackground;
    autoNext = j['autoNext'] as bool? ?? autoNext;
    autoPip = j['autoPip'] as bool? ?? autoPip;
    autoRotate = j['autoRotate'] as bool? ?? autoRotate;
    swipeSeekSeconds = (j['swipe'] as num?)?.toInt() ?? swipeSeekSeconds;
    doubleTapSeconds = (j['dtap'] as num?)?.toInt() ?? doubleTapSeconds;
  }

  Future<void> save() async {
    try {
      await _file.writeAsString(
        jsonEncode({
          'hw': hardwareDecoding,
          'subSize': subtitleSize,
          'subBottom': subtitleBottom,
          'subBg': subtitleBackground,
          'autoNext': autoNext,
          'autoPip': autoPip,
          'autoRotate': autoRotate,
          'swipe': swipeSeekSeconds,
          'dtap': doubleTapSeconds,
        }),
      );
    } catch (_) {
      // 저장 실패는 재생에 영향 없음.
    }
  }
}
