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
  static final _progressController =
      StreamController<({String id, int done, int total})>.broadcast();
  static final _doneController =
      StreamController<({String id, bool ok, String? error})>.broadcast();
  static bool _listening = false;

  static void _ensureHandler() {
    if (_listening) return;
    _listening = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'pipChanged') {
        _pipController.add(call.arguments == true);
      } else if (call.method == 'prepareProgress') {
        final args = call.arguments;
        if (args is Map) {
          final id = args['id'];
          final done = args['done'];
          final total = args['total'];
          if (id is String && done is int && total is int) {
            _progressController.add((id: id, done: done, total: total));
          }
        }
      } else if (call.method == 'prepareDone') {
        final args = call.arguments;
        if (args is Map && args['id'] is String) {
          final error = args['error'];
          _doneController.add((
            id: args['id'] as String,
            ok: args['ok'] == true,
            error: error is String ? error : null,
          ));
        }
      }
    });
  }

  /// PIP 모드에 들어가거나 나올 때 true/false가 흘러나온다.
  static Stream<bool> get pipChanges {
    _ensureHandler();
    return _pipController.stream;
  }

  /// [prepareMedia]가 파일을 내려받는 동안의 진행률.
  static Stream<({String id, int done, int total})> get prepareProgress {
    _ensureHandler();
    return _progressController.stream;
  }

  /// 받으면서 재생([PreparedMedia.stream])하는 파일의 내려받기가 끝났을 때.
  static Stream<({String id, bool ok, String? error})> get prepareDone {
    _ensureHandler();
    return _doneController.stream;
  }

  /// content:// 동영상을 재생할 수 있게 백그라운드에서 연다.
  ///
  /// 구글 드라이브 같은 클라우드 파일은 여기서 내려받기가 일어나 오래 걸릴 수 있다.
  /// 결과: 열린 파일 번호(fd → `fd://N`으로 재생) 또는 받아 둔 파일 경로, 혹은 오류/취소.
  static Future<PreparedMedia>
  prepareMedia(String uri, String id) async {
    _ensureHandler();
    if (!Platform.isAndroid) {
      return PreparedMedia(path: uri);
    }
    try {
      final map = await _channel.invokeMapMethod<String, Object?>(
        'prepareMedia',
        {'uri': uri, 'id': id},
      );
      final fd = map?['fd'];
      final path = map?['path'];
      final stream = map?['stream'];
      final total = map?['total'];
      final error = map?['error'];
      return PreparedMedia(
        fd: fd is int ? fd : null,
        path: path is String ? path : null,
        stream: stream is String ? stream : null,
        total: total is int ? total : -1,
        error: error is String
            ? error
            : (map == null ? '파일을 열 수 없습니다.' : null),
        canceled: map?['canceled'] == true,
      );
    } on PlatformException catch (e) {
      return PreparedMedia(error: e.message ?? '파일을 열 수 없습니다.');
    } on MissingPluginException {
      return PreparedMedia(path: uri);
    }
  }

  static Future<void> cancelPrepare(String id) =>
      _call<void>('cancelPrepare', {'id': id});

  /// [prepareMedia]가 연 파일 번호를 닫는다.
  static Future<void> closeFd(int fd) => _call<void>('closeFd', fd);

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

/// [DeviceMedia.prepareMedia]의 결과. 하나만 채워진다.
class PreparedMedia {
  const PreparedMedia({
    this.fd,
    this.path,
    this.stream,
    this.total = -1,
    this.error,
    this.canceled = false,
  });

  /// 바로 열린 파일 번호 → `fd://N` 으로 재생.
  final int? fd;

  /// 이미 다 받아 둔 파일 경로.
  final String? path;

  /// 아직 받는 중인 캐시 파일 경로(받으면서 재생).
  final String? stream;

  /// 전체 크기(모르면 -1).
  final int total;

  final String? error;
  final bool canceled;
}
