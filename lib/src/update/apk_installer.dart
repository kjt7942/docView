import 'dart:io';

import 'package:flutter/services.dart';

/// APK 설치 인텐트를 띄우는 네이티브 브리지.
///
/// 패키지에 의존하지 않고 MainActivity에서 직접 처리한다.
/// iOS에는 인앱 설치 개념이 없으므로 Android에서만 호출한다.
class ApkInstaller {
  const ApkInstaller._();

  static const _channel = MethodChannel('app.docviewer/installer');

  /// '알 수 없는 앱 설치' 권한이 허용되어 있는지.
  static Future<bool> canInstall() async {
    if (!Platform.isAndroid) return false;
    return await _channel.invokeMethod<bool>('canInstall') ?? false;
  }

  /// 시스템 설정의 '알 수 없는 앱 설치' 화면을 연다.
  static Future<void> openInstallSettings() async {
    if (!Platform.isAndroid) return;
    await _channel.invokeMethod<void>('openInstallSettings');
  }

  /// 다운로드한 APK를 설치 화면으로 넘긴다.
  static Future<void> install(String path) async {
    if (!Platform.isAndroid) return;
    await _channel.invokeMethod<void>('installApk', {'path': path});
  }
}
