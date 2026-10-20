import 'dart:io';

import 'package:flutter/services.dart';

import 'document.dart';

/// 다른 앱에서 "연결 프로그램"으로 넘긴 문서를 받는 네이티브 브리지.
///
/// MainActivity가 `content://` 문서를 앱 캐시로 복사한 뒤 경로를 넘겨준다.
/// Android에서만 동작하며, 다른 플랫폼에서는 항상 아무것도 받지 않는다.
class IncomingFileService {
  const IncomingFileService._();

  static const _channel = MethodChannel('app.docviewer/incoming');

  /// 앱이 문서와 함께 시작됐다면 그 문서를, 아니면 null을 돌려준다.
  ///
  /// 문서를 가져오지 못했으면(권한 없음 등) [PlatformException]을 던져 호출부가 알리게 한다.
  static Future<DocumentFile?> initialFile() async {
    if (!Platform.isAndroid) return null;
    try {
      final map = await _channel.invokeMapMethod<String, dynamic>(
        'getInitialFile',
      );
      return _parse(map);
    } on PlatformException catch (e) {
      if (e.code == 'open_failed') rethrow;
      return null;
    } on MissingPluginException {
      return null;
    }
  }

  /// 앱이 이미 켜져 있을 때 새 문서가 들어오면 [onFile]을 호출한다.
  static void listen(
    void Function(DocumentFile file) onFile, {
    void Function(String message)? onError,
  }) {
    if (!Platform.isAndroid) return;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'openError') {
        onError?.call(call.arguments as String? ?? '문서를 가져오지 못했습니다.');
        return;
      }
      if (call.method != 'openFile') return;
      final arguments = call.arguments;
      if (arguments is! Map) return;
      final file = _parse(Map<String, dynamic>.from(arguments));
      if (file != null) onFile(file);
    });
  }

  static void stopListening() {
    if (!Platform.isAndroid) return;
    _channel.setMethodCallHandler(null);
  }

  static DocumentFile? _parse(Map<String, dynamic>? map) {
    if (map == null) return null;
    final path = map['path'];
    final name = map['name'];
    if (path is! String || name is! String) return null;
    final size = map['size'];
    return DocumentFile(
      path: path,
      name: name,
      size: size is int ? size : 0,
    );
  }
}
