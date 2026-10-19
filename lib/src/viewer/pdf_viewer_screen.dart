import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';

import '../document.dart';

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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.document.name, overflow: TextOverflow.ellipsis),
        actions: [
          if (_pageCount > 0)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Text(
                  '$_pageNumber / $_pageCount',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: PdfViewer.file(
        widget.document.path,
        controller: _controller,
        params: PdfViewerParams(
          margin: 8,
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
