import 'dart:async';

import 'package:flutter/material.dart';

import '../system_bars.dart';

/// 문서를 읽는 동안 상단 제목줄과 시스템 막대(상태 표시줄·내비게이션 버튼)를 숨겨 화면을 넓게 쓰는 틀.
///
/// 처음에는 숨긴 채로 열리고, **화면 가운데를 한 번 누르면** 제목줄과 내비게이션 버튼이 함께
/// 나타난다. 다시 가운데를 누르면 함께 숨는다. 화면 맨 위를 누르거나 아래로 쓸어내려도 나타난다.
/// [page]/[pageCount]가 주어지면 오른쪽 아래에 "7 / 8" 쪽수를 계속 보여 준다.
class ReadingChrome extends StatefulWidget {
  const ReadingChrome({
    super.key,
    required this.title,
    required this.body,
    this.actions = const [],
    this.page,
    this.pageCount,
    this.pinned = false,
  });

  final String title;
  final Widget body;
  final List<Widget> actions;
  final int? page;
  final int? pageCount;

  /// true면 숨기지 않는다(오류 화면 등).
  final bool pinned;

  @override
  State<ReadingChrome> createState() => _ReadingChromeState();
}

class _ReadingChromeState extends State<ReadingChrome> {
  bool _visible = false;

  // 가운데 탭 감지(문서의 스크롤·확대·두 번 탭과 겹치지 않게 직접 판정한다).
  Offset? _downAt;
  DateTime? _downTime;
  int _pointers = 0;
  bool _multi = false;
  Timer? _tapTimer;

  @override
  void initState() {
    super.initState();
    SystemBars.show(false);
  }

  @override
  void dispose() {
    _tapTimer?.cancel();
    // 목록(탐색기) 화면은 내비게이션 버튼이 항상 보인다.
    SystemBars.show(true);
    super.dispose();
  }

  void _toggle() => setState(() => _visible = !_visible);

  void _reveal() {
    if (!_visible) setState(() => _visible = true);
  }

  void _onPointerDown(PointerDownEvent e) {
    _pointers++;
    if (_pointers > 1) _multi = true;
    if (_pointers == 1) {
      _downAt = e.position;
      _downTime = DateTime.now();
      // 두 번 탭(문서 확대)이면 앞의 탭은 메뉴 토글로 치지 않는다.
      if (_tapTimer?.isActive ?? false) {
        _tapTimer!.cancel();
        _downAt = null;
      }
    }
  }

  void _onPointerUp(PointerUpEvent e, Size size) {
    _pointers = _pointers > 0 ? _pointers - 1 : 0;
    final start = _downAt;
    final time = _downTime;
    final multi = _multi;
    if (_pointers == 0) _multi = false;
    if (start == null || time == null || multi || _pointers > 0) return;
    _downAt = null;
    final moved = (e.position - start).distance;
    final quick = DateTime.now().difference(time) < const Duration(milliseconds: 300);
    if (moved > 12 || !quick) return;
    // 가운데 영역(가로 20~80%, 세로 25~75%)만 메뉴를 토글한다. 가장자리의 링크·탭은 그대로 쓴다.
    final p = e.localPosition;
    final inCenter = p.dx > size.width * 0.2 &&
        p.dx < size.width * 0.8 &&
        p.dy > size.height * 0.25 &&
        p.dy < size.height * 0.75;
    if (!inCenter) return;
    _tapTimer = Timer(const Duration(milliseconds: 280), () {
      if (mounted) _toggle();
    });
  }

  void _onPointerCancel(PointerCancelEvent e) {
    _pointers = _pointers > 0 ? _pointers - 1 : 0;
    _downAt = null;
    if (_pointers == 0) _multi = false;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final top = MediaQuery.paddingOf(context).top;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final show = _visible || widget.pinned;
    // 제목줄이 보일 때만 시스템 내비게이션 버튼도 보인다.
    SystemBars.show(show);
    final page = widget.page;
    final count = widget.pageCount;

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: LayoutBuilder(
              builder: (context, box) => Listener(
                behavior: HitTestBehavior.translucent,
                onPointerDown: _onPointerDown,
                onPointerUp: (e) => _onPointerUp(e, box.biggest),
                onPointerCancel: _onPointerCancel,
                child: widget.body,
              ),
            ),
          ),
          if (page != null && count != null && count > 1)
            Positioned(
              right: 14,
              bottom: 14 + bottom,
              child: IgnorePointer(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.62),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '$page / $count',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          // 숨겨진 제목줄을 부르는 화면 맨 위 띠.
          if (!show)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 26,
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: _reveal,
                onVerticalDragUpdate: (d) {
                  if (d.delta.dy > 1) _reveal();
                },
                child: const SizedBox.expand(),
              ),
            ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              ignoring: !show,
              child: AnimatedSlide(
                offset: show ? Offset.zero : const Offset(0, -1),
                duration: const Duration(milliseconds: 180),
                child: Material(
                  color: theme.colorScheme.surface,
                  elevation: 3,
                  child: Padding(
                    padding: EdgeInsets.only(top: top),
                    child: SizedBox(
                      height: kToolbarHeight,
                      child: Row(
                        children: [
                          const BackButton(),
                          Expanded(
                            child: Text(
                              widget.title,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: theme.colorScheme.onSurface,
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          ...widget.actions,
                          const SizedBox(width: 4),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
