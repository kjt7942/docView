import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 문서를 읽는 동안 상단 제목줄과 상태 표시줄을 숨겨 화면을 넓게 쓰는 틀.
///
/// 열 때 잠깐 보여 준 뒤 사라지고, 화면 맨 위를 살짝 누르거나 아래로 쓸어내리면 다시 나타난다
/// (하단 시스템 내비게이션 바를 밑에서 위로 쓸어 올려 부르는 것과 같은 방식).
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
  static const _showFor = Duration(milliseconds: 2800);

  bool _visible = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _scheduleHide();
  }

  @override
  void dispose() {
    _timer?.cancel();
    // 목록 화면의 상태(상태 표시줄만 보이고 내비게이션 바는 숨김)로 되돌린다.
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.manual,
      overlays: const [SystemUiOverlay.top],
    );
    super.dispose();
  }

  void _scheduleHide() {
    _timer?.cancel();
    _timer = Timer(_showFor, () {
      if (mounted && !widget.pinned) setState(() => _visible = false);
    });
  }

  void _reveal() {
    if (!_visible) setState(() => _visible = true);
    _scheduleHide();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final top = MediaQuery.paddingOf(context).top;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final show = _visible || widget.pinned;
    final page = widget.page;
    final count = widget.pageCount;

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: widget.body),
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
