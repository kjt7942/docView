import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';

import '../document.dart';
import 'password_dialog.dart';
import 'reading_chrome.dart';

/// PDF 렌더러. PDFium 기반이라 Android/iOS에서 동일한 결과가 나온다.
class PdfViewerScreen extends StatefulWidget {
  const PdfViewerScreen({super.key, required this.document});

  final DocumentFile document;

  @override
  State<PdfViewerScreen> createState() => _PdfViewerScreenState();
}

class _PdfViewerScreenState extends State<PdfViewerScreen> {
  final _controller = PdfViewerController();
  int _pageNumber = 1;
  int _pageCount = 0;
  int _passwordAttempts = 0;
  int _reloadCount = 0; // 값이 바뀌면 PdfViewer를 새로 만들어 다시 연다.

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onViewChanged);
  }

  @override
  void dispose() {
    _controller.removeListener(_onViewChanged);
    super.dispose();
  }

  void _onViewChanged() {
    if (!_controller.isReady) return;
    final page = _controller.pageNumber;
    if (page == null || page == _pageNumber) return;
    // 스크롤 중에는 매 프레임 호출되므로 AppBar 카운터만 갱신한다.
    setState(() => _pageNumber = page);
  }

  /// pdfrx가 비밀번호를 요구할 때마다 호출된다. 맞을 때까지, 또는 null(취소)을 돌려줄 때까지 반복된다.
  Future<String?> _askPassword() {
    final retry = _passwordAttempts++ > 0;
    return showPasswordDialog(
      context,
      fileName: widget.document.name,
      retry: retry,
    );
  }

  Widget _buildError(BuildContext context, Object error) {
    final theme = Theme.of(context);
    final locked = error is PdfPasswordException;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              locked ? Icons.lock_outline : Icons.error_outline,
              size: 40,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(
              locked
                  ? '암호로 보호된 문서입니다. 비밀번호를 입력해야 열 수 있습니다.'
                  : '문서를 열 수 없습니다. 손상되었거나 지원하지 않는 PDF일 수 있습니다.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => setState(() {
                _passwordAttempts = 0;
                _reloadCount++;
              }),
              icon: Icon(locked ? Icons.lock_open : Icons.refresh),
              label: Text(locked ? '비밀번호 입력' : '다시 시도'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ReadingChrome(
      title: widget.document.name,
      page: _pageCount > 0 ? _pageNumber : null,
      pageCount: _pageCount > 0 ? _pageCount : null,
      body: PdfViewer.file(
        widget.document.path,
        key: ValueKey(_reloadCount),
        controller: _controller,
        passwordProvider: _askPassword,
        params: PdfViewerParams(
          margin: 8,
          errorBannerBuilder: (context, error, stackTrace, documentRef) =>
              _buildError(context, error),
          backgroundColor: theme.colorScheme.surfaceContainerHighest,
          onViewerReady: (document, controller) {
            if (!mounted) return;
            setState(() {
              _pageCount = document.pages.length;
              _pageNumber = controller.pageNumber ?? 1;
            });
          },
        ),
      ),
    );
  }
}
