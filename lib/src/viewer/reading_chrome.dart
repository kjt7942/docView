import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
    this.onPage,
  });

  final String title;
  final Widget body;
  final List<Widget> actions;
  final int? page;
  final int? pageCount;

  /// true면 숨기지 않는다(오류 화면 등).
  final bool pinned;

  /// 화면 위쪽(25%)을 누르면 -1(이전), 아래쪽(25%)을 누르면 +1(다음)로 불린다.
  /// 길게 누르고 있으면 탭을 연타하듯 반복해서 불린다. null이면 상·하단 넘김을 쓰지 않는다.
  final ValueChanged<int>? onPage;

  @override
  State<ReadingChrome> createState() => _ReadingChromeState();
}

class _ReadingChromeState extends State<ReadingChrome> {
  bool _visible = false;

  // 터치 판정: 문서의 스크롤·확대와 겹치지 않게 포인터를 직접 보고 판단한다.
  //  - 가운데(가로 20~80%, 세로 25~75%) 짧게 누르기 → 메뉴 표시/숨김(두 번 탭 확대와 구분)
  //  - 위쪽 25% / 아래쪽 25% 짧게 누르기 → 이전 / 다음 쪽(즉시)
  //  - 위쪽/아래쪽을 길게 누르고 있기 → 탭을 연타하듯 한 쪽씩 계속 넘김
  static const _zone = 0.25;
  static const _holdDelay = Duration(milliseconds: 450);
  static const _holdInterval = Duration(milliseconds: 333);

  Offset? _downAt;
  DateTime? _downTime;
  int _downZone = 0; // -1 위, 1 아래, 0 그 밖
  int _pointers = 0;
  bool _multi = false;
  Timer? _tapTimer;
  Timer? _holdStart;
  Timer? _holdRepeat;
  bool _holding = false;

  @override
  void initState() {
    super.initState();
    SystemBars.show(false);
  }

  @override
  void dispose() {
    _tapTimer?.cancel();
    _stopHold();
    // 목록(탐색기) 화면은 내비게이션 버튼이 항상 보인다.
    SystemBars.show(true);
    super.dispose();
  }

  void _toggle() => setState(() => _visible = !_visible);

  void _reveal() {
    if (!_visible) setState(() => _visible = true);
  }

  void _stopHold() {
    _holdStart?.cancel();
    _holdStart = null;
    _holdRepeat?.cancel();
    _holdRepeat = null;
  }

  int _zoneOf(Offset p, Size size) {
    if (widget.onPage == null) return 0;
    if (p.dy < size.height * _zone) return -1;
    if (p.dy > size.height * (1 - _zone)) return 1;
    return 0;
  }

  void _onPointerDown(PointerDownEvent e, Size size) {
    _pointers++;
    if (_pointers > 1) {
      _multi = true;
      _stopHold();
      return;
    }
    _downAt = e.position;
    _downTime = DateTime.now();
    _holding = false;
    _downZone = _zoneOf(e.localPosition, size);
    if (_downZone == 0) {
      // 두 번 탭(문서 확대)이면 앞의 탭은 메뉴 토글로 치지 않는다.
      if (_tapTimer?.isActive ?? false) {
        _tapTimer!.cancel();
        _downAt = null;
      }
      return;
    }
    final dir = _downZone;
    _holdStart = Timer(_holdDelay, () {
      if (!mounted || _multi || _downAt == null) return;
      _holding = true;
      HapticFeedback.selectionClick();
      if (_visible) setState(() => _visible = false);
      widget.onPage?.call(dir);
      _holdRepeat = Timer.periodic(_holdInterval, (_) => widget.onPage?.call(dir));
    });
  }

  void _onPointerMove(PointerMoveEvent e) {
    final start = _downAt;
    if (start == null) return;
    // 끌어서 스크롤하는 중이면 넘김·탭이 아니다.
    if ((e.position - start).distance > 12) {
      _stopHold();
      if (!_holding) _downAt = null;
    }
  }

  void _onPointerUp(PointerUpEvent e, Size size) {
    _pointers = _pointers > 0 ? _pointers - 1 : 0;
    final start = _downAt;
    final time = _downTime;
    final multi = _multi;
    final held = _holding;
    _stopHold();
    _holding = false;
    if (_pointers == 0) _multi = false;
    if (start == null || time == null || multi || held || _pointers > 0) return;
    _downAt = null;
    final moved = (e.position - start).distance;
    final quick = DateTime.now().difference(time) < const Duration(milliseconds: 350);
    if (moved > 12 || !quick) return;

    final p = e.localPosition;
    final zone = _zoneOf(p, size);
    if (zone != 0) {
      // 연타해도 매번 바로 넘어가도록 기다리지 않는다.
      if (_visible) setState(() => _visible = false);
      widget.onPage?.call(zone);
      return;
    }
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
    _stopHold();
    _holding = false;
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
                onPointerDown: (e) => _onPointerDown(e, box.biggest),
                onPointerMove: _onPointerMove,
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
