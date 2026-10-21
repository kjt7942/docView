import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../document.dart';
import 'document_web_server.dart';

/// DOCX/XLSX/PPTX/HWP를 WebView 안의 오프라인 JS 렌더러로 표시한다.
class WebDocumentScreen extends StatefulWidget {
  const WebDocumentScreen({super.key, required this.document});

  final DocumentFile document;

  @override
  State<WebDocumentScreen> createState() => _WebDocumentScreenState();
}

class _WebDocumentScreenState extends State<WebDocumentScreen> {
  DocumentWebServer? _server;
  WebViewController? _controller;
  String? _error;
  bool _rendering = true;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final kind = widget.document.webKind;
    if (kind == null) {
      setState(() {
        _error = '이 형식은 아직 지원하지 않습니다.';
        _rendering = false;
      });
      return;
    }

    DocumentWebServer? server;
    try {
      server = await DocumentWebServer.start(
        File(widget.document.path),
        kind: kind,
      );
      if (!mounted) {
        await server.close();
        return;
      }

      final dark = PlatformDispatcher.instance.platformBrightness == Brightness.dark;
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..enableZoom(true)
        ..setBackgroundColor(dark ? const Color(0xFF121518) : const Color(0xFFECEEF2))
        ..addJavaScriptChannel(
          'DocumentBridge',
          onMessageReceived: _onBridgeMessage,
        )
        ..setNavigationDelegate(
          NavigationDelegate(
            onNavigationRequest: (request) {
              final uri = Uri.tryParse(request.url);
              final isLocal =
                  uri != null &&
                  uri.scheme == 'http' &&
                  (uri.host == '127.0.0.1' || uri.host == 'localhost');
              return isLocal
                  ? NavigationDecision.navigate
                  : NavigationDecision.prevent;
            },
          ),
        )
        ..loadRequest(server.uri);

      setState(() {
        _server = server;
        _controller = controller;
      });
    } catch (_) {
      await server?.close();
      if (!mounted) return;
      setState(() {
        _error = '문서를 여는 중 문제가 발생했습니다.';
        _rendering = false;
      });
    }
  }

  void _onBridgeMessage(JavaScriptMessage message) {
    Map<String, dynamic>? payload;
    try {
      final decoded = jsonDecode(message.message);
      if (decoded is Map<String, dynamic>) payload = decoded;
    } catch (_) {
      return;
    }
    if (payload == null || !mounted) return;

    switch (payload['type']) {
      case 'openLink':
        _openLink(payload['url']);
      case 'ready':
        setState(() => _rendering = false);
      case 'error':
        setState(() {
          _rendering = false;
          _error = payload?['message'] as String? ?? '문서를 표시할 수 없습니다.';
        });
    }
  }

  /// 문서 안의 링크는 http(s)/메일/전화만 외부 앱으로 연다.
  Future<void> _openLink(Object? url) async {
    final uri = url is String ? Uri.tryParse(url) : null;
    if (uri == null || !const {'http', 'https', 'mailto', 'tel'}.contains(uri.scheme)) {
      return;
    }
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('링크를 열 수 없습니다.')),
      );
    }
  }

  Future<void> _retry() async {
    final old = _server;
    setState(() {
      _error = null;
      _rendering = true;
      _server = null;
      _controller = null;
    });
    await old?.close();
    await _start();
  }

  @override
  void dispose() {
    _server?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.document.name, overflow: TextOverflow.ellipsis),
        actions: [
          if (_error != null)
            IconButton(
              onPressed: _retry,
              icon: const Icon(Icons.refresh),
              tooltip: '다시 열기',
            ),
        ],
      ),
      body: _buildBody(theme),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.error_outline,
                size: 40,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _retry,
                icon: const Icon(Icons.refresh),
                label: const Text('다시 시도'),
              ),
            ],
          ),
        ),
      );
    }

    final controller = _controller;
    if (controller == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return Stack(
      children: [
        WebViewWidget(controller: controller),
        if (_rendering)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(
              minHeight: 2,
              backgroundColor: Colors.transparent,
              color: theme.colorScheme.primary,
            ),
          ),
      ],
    );
  }
}
