import 'dart:io';

import 'package:docviewer/src/viewer/document_web_server.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // flutter_test는 HttpClient를 400으로 가로챈다. 실제 루프백 서버를 검증해야 하므로 해제한다.
  HttpOverrides.global = null;

  late Directory tempDir;
  late File document;
  late DocumentWebServer server;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('docviewer_server_test');
    document = File('${tempDir.path}/sample.docx')
      ..writeAsBytesSync(List<int>.generate(2048, (i) => i % 256));
    server = await DocumentWebServer.start(document, kind: 'docx');
  });

  tearDown(() async {
    await server.close();
    await tempDir.delete(recursive: true);
  });

  Future<HttpClientResponse> request(Uri uri) async {
    final client = HttpClient();
    try {
      final req = await client.getUrl(uri);
      return await req.close();
    } finally {
      client.close();
    }
  }

  test('viewer.html과 번들 JS를 서빙한다', () async {
    final viewer = await request(server.uri);
    expect(viewer.statusCode, 200);
    expect(viewer.headers.contentType?.mimeType, 'text/html');
    final html = await viewer.transform(const SystemEncoding().decoder).join();
    expect(html, contains('src="vendor/pptx-browser.js"'));
    expect(html, contains('src="viewer.js"'));

    // 하위 자원은 viewer.html 기준 상대 경로이므로 같은 토큰 경로 아래에 있어야 한다.
    final vendor = await request(
      server.uri.replace(
        path: '${_tokenPrefix(server)}/vendor/docx-preview.min.js',
        queryParameters: const {},
      ),
    );
    expect(vendor.statusCode, 200);
    await vendor.drain<void>();

    final css = await request(
      server.uri.replace(
        path: '${_tokenPrefix(server)}/viewer.css',
        queryParameters: const {},
      ),
    );
    expect(css.statusCode, 200);
    await css.drain<void>();
  });

  test('viewer.html은 상대 경로로 자원을 참조한다', () async {
    final viewer = await request(server.uri);
    final html = await viewer.transform(const SystemEncoding().decoder).join();
    // 절대 경로(/...)면 토큰 경로를 벗어나 403이 된다.
    expect(html, isNot(contains('src="/')));
    expect(html, isNot(contains('href="/')));
  });

  test('문서 바이트를 그대로 돌려준다', () async {
    final response = await request(
      server.uri.replace(
        path: '${_tokenPrefix(server)}/file',
        queryParameters: const {},
      ),
    );
    expect(response.statusCode, 200);
    final bytes = await response.fold<List<int>>(
      <int>[],
      (acc, chunk) => acc..addAll(chunk),
    );
    expect(bytes, equals(document.readAsBytesSync()));
  });

  test('토큰이 다르면 403', () async {
    final response = await request(
      server.uri.replace(path: '/wrong-token/viewer.html'),
    );
    expect(response.statusCode, HttpStatus.forbidden);
    await response.drain<void>();
  });

  test('토큰 없이 문서를 요청하면 403', () async {
    final response = await request(server.uri.replace(path: '/file'));
    expect(response.statusCode, HttpStatus.forbidden);
    await response.drain<void>();
  });

  test('허용 목록에 없는 경로는 404', () async {
    final response = await request(
      server.uri.replace(
        path: '${_tokenPrefix(server)}/pubspec.yaml',
        queryParameters: const {},
      ),
    );
    expect(response.statusCode, HttpStatus.notFound);
    await response.drain<void>();
  });
}

/// `/<token>/viewer.html` 에서 `/<token>` 부분만 꺼낸다.
String _tokenPrefix(DocumentWebServer server) =>
    '/${server.uri.pathSegments.first}';
