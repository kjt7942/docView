import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

/// 아직 내려받는 중인 파일을 재생 엔진에 HTTP로 흘려 주는 루프백 서버.
///
/// 클라우드 앱이 파일을 "흐름(파이프)"으로만 넘겨줄 때 쓴다. 앱은 그 흐름을 캐시 파일로 받으면서,
/// 재생 엔진은 이 서버에서 받은 만큼부터 바로 재생한다. 아직 안 받은 위치를 요청하면 그 부분이
/// 받아질 때까지 기다렸다가 보낸다(탐색은 받은 범위 안에서 즉시, 그 뒤는 받는 대로).
class GrowingFileServer {
  GrowingFileServer._(this._server, this.file, this._token, this.totalSize);

  final HttpServer _server;
  final File file;
  final String _token;

  /// 전체 크기(바이트). 모르면 -1.
  final int totalSize;

  bool _complete = false;
  bool _failed = false;
  bool _closed = false;

  static Future<GrowingFileServer> start(File file, int totalSize) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final random = Random.secure();
    final token = List.generate(12, (_) => random.nextInt(36).toRadixString(36)).join();
    final instance = GrowingFileServer._(server, file, token, totalSize);
    server.listen(instance._handle, onError: (_) {});
    return instance;
  }

  String get url => 'http://127.0.0.1:${_server.port}/$_token/media';

  /// 내려받기가 끝났음을 알린다(실패면 [failed]).
  void markComplete({bool failed = false}) {
    _complete = true;
    _failed = failed;
  }

  Future<void> close() async {
    _closed = true;
    await _server.close(force: true);
  }

  int get _available {
    try {
      return file.lengthSync();
    } catch (_) {
      return 0;
    }
  }

  Future<void> _handle(HttpRequest request) async {
    final res = request.response;
    try {
      final segs = request.uri.pathSegments;
      if (segs.length != 2 || segs[0] != _token || segs[1] != 'media') {
        res.statusCode = HttpStatus.forbidden;
        await res.close();
        return;
      }
      final size = totalSize > 0
          ? totalSize
          : (_complete && !_failed ? _available : -1);

      var start = 0;
      int? end;
      final range = request.headers.value(HttpHeaders.rangeHeader);
      final m = range == null ? null : RegExp(r'bytes=(\d*)-(\d*)').firstMatch(range);
      if (m != null) {
        if (m.group(1)!.isNotEmpty) start = int.parse(m.group(1)!);
        if (m.group(2)!.isNotEmpty) end = int.parse(m.group(2)!);
        if (m.group(1)!.isEmpty && end != null && size > 0) {
          // bytes=-N : 끝에서 N바이트
          start = max(0, size - end);
          end = size - 1;
        }
      }

      res.headers
        ..contentType = ContentType('application', 'octet-stream')
        ..set(HttpHeaders.acceptRangesHeader, size > 0 ? 'bytes' : 'none')
        ..set(HttpHeaders.cacheControlHeader, 'no-store');

      if (size > 0) {
        if (start >= size) {
          res.statusCode = HttpStatus.requestedRangeNotSatisfiable;
          res.headers.set(HttpHeaders.contentRangeHeader, 'bytes */$size');
          await res.close();
          return;
        }
        final last = min(end ?? size - 1, size - 1);
        res.headers.contentLength = last - start + 1;
        if (m != null) {
          res.statusCode = HttpStatus.partialContent;
          res.headers.set(HttpHeaders.contentRangeHeader, 'bytes $start-$last/$size');
        }
        end = last;
      } else {
        // 크기를 모르면 처음부터 끝까지 흘려보내기만 한다(탐색 불가).
        start = 0;
        end = null;
      }

      if (request.method == 'HEAD') {
        await res.close();
        return;
      }
      await _pump(res, start, end);
      await res.close();
    } catch (_) {
      try {
        await res.close();
      } catch (_) {
        // 연결이 이미 끊겼다(재생 엔진이 다른 위치로 탐색).
      }
    }
  }

  Future<void> _pump(HttpResponse res, int start, int? end) async {
    final raf = await file.open();
    try {
      var pos = start;
      while (!_closed) {
        if (end != null && pos > end) break;
        final available = _available;
        if (pos >= available) {
          if (_complete) break; // 더 받을 것이 없다.
          await Future<void>.delayed(const Duration(milliseconds: 120));
          continue;
        }
        var want = min(available - pos, 256 * 1024);
        if (end != null) want = min(want, end - pos + 1);
        await raf.setPosition(pos);
        final Uint8List chunk = await raf.read(want);
        if (chunk.isEmpty) {
          await Future<void>.delayed(const Duration(milliseconds: 60));
          continue;
        }
        res.add(chunk);
        await res.flush();
        pos += chunk.length;
      }
    } finally {
      await raf.close();
    }
  }
}
