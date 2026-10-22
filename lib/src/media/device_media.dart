import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';

import '../document.dart';

/// 화면 밝기, 공유, 화면 속 화면(PIP)을 다루는 네이티브 브리지(Android 전용).
///
/// 다른 플랫폼이나 테스트에서는 조용히 아무 일도 하지 않는다.
class DeviceMedia {
  DeviceMedia._();

  static const _channel = MethodChannel('app.docviewer/media');

  static final _pipController = StreamController<bool>.broadcast();
  static bool _listening = false;

  /// PIP 모드에 들어가거나 나올 때 true/false가 흘러나온다.
  static Stream<bool> get pipChanges {
    if (!_listening) {
      _listening = true;
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'pipChanged') {
          _pipController.add(call.arguments == true);
        }
      });
    }
    return _pipController.stream;
  }

  static Future<T?> _call<T>(String method, [Object? arguments]) async {
    if (!Platform.isAndroid) return null;
    try {
      return await _channel.invokeMethod<T>(method, arguments);
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  /// 동영상·음악 파일을 고른다. 큰 파일도 복사하지 않고 원본을 바로 연다.
  /// 취소하면 null. Android가 아니면 항상 null.
  static Future<DocumentFile?> pickMedia() async {
    final map = await _call<Map<Object?, Object?>>('pickMedia');
    if (map == null) return null;
    final path = map['path'];
    final name = map['name'];
    final size = map['size'];
    if (path is! String || name is! String) return null;
    return DocumentFile(path: path, name: name, size: size is int ? size : 0);
  }

  /// 현재 창 밝기(0~1). 시스템 밝기를 따르는 중이면 시스템 값.
  static Future<double> brightness() async =>
      (await _call<double>('getBrightness')) ?? 0.5;

  /// 이 창의 밝기만 바꾼다(시스템 설정은 그대로). null이면 시스템 밝기로 되돌린다.
  static Future<void> setBrightness(double? value) =>
      _call<void>('setBrightness', value ?? -1.0);

  /// 다른 앱으로 파일을 보낸다.
  static Future<bool> share(String path, String mimeType) async =>
      (await _call<bool>('share', {'path': path, 'mime': mimeType})) ?? false;

  /// 지원하는 기기인지(Android 8.0 이상).
  static Future<bool> pipSupported() async =>
      (await _call<bool>('pipSupported')) ?? false;

  /// 지금 바로 PIP로 들어간다.
  static Future<bool> enterPip({int width = 16, int height = 9}) async =>
      (await _call<bool>('enterPip', {'width': width, 'height': height})) ??
      false;

  /// 홈 버튼 등으로 앱을 벗어날 때 자동으로 PIP로 들어갈지.
  static Future<void> setAutoPip(bool enabled, {int width = 16, int height = 9}) =>
      _call<void>('setAutoPip', {
        'enabled': enabled,
        'width': width,
        'height': height,
      });
}
