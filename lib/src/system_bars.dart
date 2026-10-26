import 'package:flutter/services.dart';

/// 상태 표시줄·하단 내비게이션 버튼(3버튼/제스처 바) 표시를 한곳에서 관리한다.
///
/// - 목록(탐색기) 화면: 항상 보인다.
/// - 문서·사진·동영상을 볼 때: 기본은 숨기고, 화면 가운데를 눌러 뷰어 도구를 띄우면 함께 보인다.
///   숨긴 상태에서도 화면 끝에서 밀면 잠깐 나타난다.
class SystemBars {
  const SystemBars._();

  static bool? _visible;

  static Future<void> show(bool visible) async {
    if (_visible == visible) return;
    _visible = visible;
    try {
      if (visible) {
        await SystemChrome.setEnabledSystemUIMode(
          SystemUiMode.manual,
          overlays: SystemUiOverlay.values,
        );
      } else {
        await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      }
    } catch (_) {
      // 지원하지 않는 플랫폼(테스트 등)은 무시.
    }
  }
}
