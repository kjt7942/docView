import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';

import '../document.dart';
import 'password_dialog.dart';
import 'reading_chrome.dart';

/// PDF 렌더러. PDFium 기반이라 Android/iOS에서 동일한 결과가 나온다.
///
/// 가로 화면에서 세로형 문서는 한 화면에 2쪽씩 보여 주고,
/// 앱바의 버튼으로 쪽을 골라 원본 파일에서 삭제할 수 있다.
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
  bool _portraitDoc = false; // 첫 쪽이 세로형인가.
  bool _spread = false; // 지금 2쪽 레이아웃인가.
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

  /// 화면 위/아래를 누르면 이전/다음 쪽(2쪽 모드에서는 이전/다음 줄)으로 바로 이동한다.
  void _turnPage(int direction) {
    if (!_controller.isReady) return;
    final current = _controller.pageNumber ?? _pageNumber;
    if (_spread) {
      final start = (current.isOdd ? current : current - 1) + 2 * direction;
      if (start < 1 || start > _pageCount) return;
      _fitRow(start);
      return;
    }
    final target = current + direction;
    if (target < 1 || target > _pageCount) return;
    _controller.goToPage(pageNumber: target, duration: Duration.zero);
  }

  /// start쪽이 든 줄 전체가 화면에 들어오게 맞춘다.
  void _fitRow(int start) {
    final layouts = _controller.layout.pageLayouts;
    var rect = layouts[start - 1];
    if (start < layouts.length) rect = rect.expandToInclude(layouts[start]);
    _controller.goTo(
      _controller.calcMatrixForArea(rect: rect.inflate(8)),
      duration: Duration.zero,
    );
  }

  PdfPageLayout _layoutPages(List<PdfPage> pages, PdfViewerParams params) {
    final m = params.margin;
    final colW = pages.fold(0.0, (w, p) => math.max(w, p.width));
    final rects = <Rect>[];
    var y = m;
    if (!_spread) {
      for (final p in pages) {
        rects.add(Rect.fromLTWH(m + (colW - p.width) / 2, y, p.width, p.height));
        y += p.height + m;
      }
      return PdfPageLayout(pageLayouts: rects, documentSize: Size(colW + m * 2, y));
    }
    for (var i = 0; i < pages.length; i += 2) {
      final pair = pages.skip(i).take(2).toList();
      final h = pair.fold(0.0, (h, p) => math.max(h, p.height));
      // 왼쪽 쪽은 가운데 쪽으로, 오른쪽 쪽도 가운데로 붙여 책처럼 보이게 한다.
      rects.add(Rect.fromLTWH(m + colW - pair[0].width,
          y + (h - pair[0].height) / 2, pair[0].width, pair[0].height));
      if (pair.length > 1) {
        rects.add(Rect.fromLTWH(m + colW + m, y + (h - pair[1].height) / 2,
            pair[1].width, pair[1].height));
      }
      y += h + m;
    }
    return PdfPageLayout(
        pageLayouts: rects, documentSize: Size(colW * 2 + m * 3, y));
  }

  /// 방향이 바뀌면 레이아웃을 다시 잡고 현재 쪽을 화면에 맞춘다.
  void _syncSpread(bool want) {
    if (want == _spread || !_controller.isReady) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_controller.isReady || want == _spread) return;
      final page = _controller.pageNumber ?? 1;
      _spread = want;
      _controller.invalidate();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_controller.isReady) return;
        if (_spread) {
          _fitRow(page.isOdd ? page : page - 1);
        } else {
          _controller.goToPage(pageNumber: page, duration: Duration.zero);
        }
      });
    });
  }

  Future<void> _deletePages() async {
    final doc = _controller.document;
    final picked = await Navigator.of(context).push<Set<int>>(
      MaterialPageRoute(builder: (_) => _PageDeleteScreen(document: doc)),
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    if (picked.length >= doc.pages.length) {
      _snack('모든 쪽을 삭제할 수는 없습니다.');
      return;
    }
    var removeSecurity = false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setD) => AlertDialog(
          title: Text('${picked.length}쪽 삭제'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('원본 파일에서 선택한 쪽이 삭제되며 되돌릴 수 없습니다.'),
              if (doc.isEncrypted)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: removeSecurity,
                  onChanged: (v) => setD(() => removeSecurity = v ?? false),
                  title: const Text('암호 해제하고 저장'),
                  subtitle: const Text('끄면 암호가 그대로 유지됩니다.'),
                ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('취소')),
            FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('삭제')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      doc.pages = [
        for (final p in doc.pages)
          if (!picked.contains(p.pageNumber)) p,
      ];
      final bytes = await doc.encodePdf(removeSecurity: removeSecurity);
      final tmp = File('${widget.document.path}.tmp');
      await tmp.writeAsBytes(bytes, flush: true);
      await tmp.rename(widget.document.path);
      if (!mounted) return;
      setState(() {
        _pageCount = 0;
        _pageNumber = 1;
        _reloadCount++;
      });
      _snack('${picked.length}쪽을 삭제했습니다.');
    } catch (e) {
      _snack('삭제하지 못했습니다: $e');
      // 메모리에 남은 변경분을 버리고 원본을 다시 연다.
      if (mounted) setState(() => _reloadCount++);
    }
  }

  void _snack(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

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
    final landscape =
        MediaQuery.orientationOf(context) == Orientation.landscape;
    if (_pageCount > 0) _syncSpread(landscape && _portraitDoc);
    return ReadingChrome(
      title: widget.document.name,
      page: _pageCount > 0 ? _pageNumber : null,
      pageCount: _pageCount > 0 ? _pageCount : null,
      onPage: _pageCount > 0 ? _turnPage : null,
      actions: [
        if (_pageCount > 1)
          IconButton(
            tooltip: '쪽 삭제',
            icon: const Icon(Icons.delete_sweep_outlined),
            onPressed: _deletePages,
          ),
      ],
      body: PdfViewer.file(
        widget.document.path,
        key: ValueKey(_reloadCount),
        controller: _controller,
        passwordProvider: _askPassword,
        params: PdfViewerParams(
          margin: 8,
          layoutPages: _layoutPages,
          errorBannerBuilder: (context, error, stackTrace, documentRef) =>
              _buildError(context, error),
          backgroundColor: theme.colorScheme.surfaceContainerHighest,
          onViewerReady: (document, controller) {
            if (!mounted) return;
            final first = document.pages.first;
            setState(() {
              _pageCount = document.pages.length;
              _pageNumber = controller.pageNumber ?? 1;
              _portraitDoc = first.height > first.width;
            });
          },
        ),
      ),
    );
  }
}

/// 쪽 썸네일을 눌러 삭제할 쪽을 고르는 화면. 고른 쪽 번호 집합을 돌려준다.
class _PageDeleteScreen extends StatefulWidget {
  const _PageDeleteScreen({required this.document});

  final PdfDocument document;

  @override
  State<_PageDeleteScreen> createState() => _PageDeleteScreenState();
}

class _PageDeleteScreenState extends State<_PageDeleteScreen> {
  final _picked = <int>{};

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(_picked.isEmpty ? '삭제할 쪽 선택' : '${_picked.length}쪽 선택'),
        actions: [
          TextButton(
            onPressed:
                _picked.isEmpty ? null : () => Navigator.pop(context, _picked),
            child: const Text('삭제'),
          ),
        ],
      ),
      body: GridView.builder(
        padding: const EdgeInsets.all(8),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 160,
          childAspectRatio: 0.68,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
        ),
        itemCount: widget.document.pages.length,
        itemBuilder: (context, i) {
          final n = i + 1;
          final on = _picked.contains(n);
          return GestureDetector(
            onTap: () => setState(() => on ? _picked.remove(n) : _picked.add(n)),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Column(
                  children: [
                    Expanded(
                      child: DecoratedBox(
                        position: DecorationPosition.foreground,
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: on ? scheme.error : Colors.transparent,
                            width: 3,
                          ),
                        ),
                        child: PdfPageView(
                            document: widget.document, pageNumber: n),
                      ),
                    ),
                    Text('$n'),
                  ],
                ),
                if (on)
                  Positioned(
                    top: 4,
                    right: 4,
                    child: Icon(Icons.check_circle, color: scheme.error),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
