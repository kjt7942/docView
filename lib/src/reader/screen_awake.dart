import 'package:flutter/services.dart';

/// 읽는 동안 화면이 꺼지지 않게 한다(Android `FLAG_KEEP_SCREEN_ON`).
///
/// 네이티브 쪽이 없는 환경(테스트, iOS)에서는 아무 일도 하지 않는다.
class ScreenAwake {
  const ScreenAwake._();

  static const _channel = MethodChannel('app.docviewer/screen');

  static Future<void> set(bool on) async {
    try {
      await _channel.invokeMethod<void>('keepOn', on);
    } on MissingPluginException {
      // 지원하지 않는 플랫폼.
    } on PlatformException {
      // 화면 유지는 부가 기능이라 실패해도 읽기를 막지 않는다.
    }
  }
}
