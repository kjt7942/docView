import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart' show rootBundle;

/// 문서 하나를 WebView에서 열기 위한 초소형 로컬 서버.
///
/// 왜 서버인가: WKWebView/Android WebView 모두 `file://`에서 fetch()를 막기 때문에
/// 번들된 JS 렌더러와 문서 바이트를 같은 출처로 제공해야 한다.
/// 127.0.0.1에만 바인딩하고, 추측 불가능한 토큰이 없으면 403을 돌려준다.
/// 외부로 나가는 요청은 없다(완전 오프라인).
class DocumentWebServer {
  DocumentWebServer._(this._server, this._file, this._token, this.kind);

  final HttpServer _server;
  final File _file;
  final String _token;
  final String kind;

  static const _assetRoot = 'assets/web';

  /// 허용된 정적 파일만 서빙한다(경로 탐색 방지).
  static const _assets = <String, String>{
    '/viewer.html': 'text/html; charset=utf-8',
    '/viewer.css': 'text/css; charset=utf-8',
    '/viewer.js': 'text/javascript; charset=utf-8',
    '/vendor/jszip.min.js': 'text/javascript; charset=utf-8',
    '/vendor/docx-preview.min.js': 'text/javascript; charset=utf-8',
    '/vendor/xlsx.full.min.js': 'text/javascript; charset=utf-8',
    '/vendor/pptx-browser.js': 'text/javascript; charset=utf-8',
    '/vendor/hwp.min.js': 'text/javascript; charset=utf-8',
  };

  static Future<DocumentWebServer> start(
    File file, {
    required String kind,
  }) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final instance = DocumentWebServer._(server, file, _randomToken(), kind);
    server.listen(instance._handle);
    return instance;
  }

  /// 토큰은 쿼리가 아니라 경로 첫 세그먼트에 둔다.
  ///
  /// viewer.html이 불러오는 CSS/JS/문서 요청은 상대 경로이므로, 토큰이 경로에
  /// 있어야 모든 하위 요청이 같은 토큰을 자동으로 달고 나간다. (쿼리에 두면
  /// 하위 요청에서 토큰이 빠져 전부 403이 된다.)
  Uri get uri => Uri(
    scheme: 'http',
    host: '127.0.0.1',
    port: _server.port,
    path: '/$_token/viewer.html',
    queryParameters: {'kind': kind},
  );

  static String _randomToken() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return base64Url.encode(bytes);
  }

  Future<void> close() => _server.close(force: true);

  Future<void> _handle(HttpRequest request) async {
    try {
      final segments = request.uri.pathSegments;
      if (segments.isEmpty || segments.first != _token) {
        request.response.statusCode = HttpStatus.forbidden;
        await request.response.close();
        return;
      }

      // 토큰 세그먼트를 떼어낸 나머지가 실제 자원 경로다.
      final rest = segments.skip(1).join('/');
      final path = rest.isEmpty ? '/viewer.html' : '/$rest';

      if (path == '/file') {
        await _serveDocument(request.response);
        return;
      }

      final mime = _assets[path];
      if (mime == null) {
        request.response.statusCode = HttpStatus.notFound;
        await request.response.close();
        return;
      }

      final data = await rootBundle.load('$_assetRoot$path');
      final response = request.response
        ..headers.contentType = ContentType.parse(mime)
        ..headers.set(HttpHeaders.cacheControlHeader, 'no-store')
        ..headers.set('X-Content-Type-Options', 'nosniff');
      response.add(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      );
      await response.close();
    } catch (_) {
      try {
        await request.response.close();
      } catch (_) {
        // 이미 닫힌 응답은 무시한다.
      }
    }
  }

  Future<void> _serveDocument(HttpResponse response) async {
    if (!await _file.exists()) {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }
    final length = await _file.length();
    response.headers
      ..contentType = ContentType.binary
      ..contentLength = length
      ..set(HttpHeaders.cacheControlHeader, 'no-store');
    await response.addStream(_file.openRead());
    await response.close();
  }
}
