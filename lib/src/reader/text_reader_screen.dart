import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter/services.dart';

import '../document.dart';
import 'reader_settings.dart';
import 'reader_settings_sheet.dart';
import 'reader_store.dart';
import 'reader_text.dart';
import 'screen_awake.dart';
import 'text_decoder.dart';

/// TXT 전용 리더.
///
/// 문단마다 높이를 미리 재 두고(`itemExtentBuilder`) 스크롤 위치를 정확히 계산한다.
/// 그래서 책갈피·검색·진행률 이동이 정확하고, 화면을 눌러 "한 화면씩" 넘기는 것도 픽셀 단위로 제어된다.
class TextReaderScreen extends StatefulWidget {
  const TextReaderScreen({
    super.key,
    required this.document,
    this.initialQuery,
  });

  final DocumentFile document;

  /// 문서 검색에서 들어왔다면 열자마자 이 단어를 찾아 보여준다.
  final String? initialQuery;

  @override
  State<TextReaderScreen> createState() => _TextReaderScreenState();
}

class _TextReaderScreenState extends State<TextReaderScreen> {
  static const _warmColor = Color(0xFFFFB066);
  static const _tapZone = 0.25; // 화면 위/아래 25%가 넘김 영역

  final _scroll = ScrollController();
  final _progress = ValueNotifier<double>(0);
  final _measureProgress = ValueNotifier<double>(0);
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();

  // 눈 보호 필터·어둡게 오버레이는 켜고 끌 때 위젯 트리에 끼어들거나 빠진다.
  // 키가 없으면 그때마다 목록이 새로 만들어져 스크롤 위치가 맨 앞으로 돌아간다.
  final _bodyKey = GlobalKey();

  ReaderStore? _store;
  ReaderSettings _s = const ReaderSettings();
  String? _raw;
  ReaderText? _text;
  String? _error;

  List<double> _extents = const [];
  List<double> _offsets = const [0];
  bool _measuring = true;
  int _layoutGen = 0;
  double _layoutWidth = 0;
  bool _firstLayoutDone = false;

  bool _showBars = true;
  bool _searching = false;
  String _query = '';
  List<SearchHit> _hits = const [];
  Map<int, List<(int, SearchHit)>> _hitsByParagraph = const {};
  int _hitIndex = -1;

  Timer? _holdTimer;

  // 문서를 열면 조작 방법을 보여 주려고 메뉴를 띄우지만, 그대로 두면 하단 바가 아래쪽 넘김 영역을 가린다.
  Timer? _autoHide;

  String get _key =>
      ReaderStore.keyFor(widget.document.name, widget.document.size);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _init();
  }

  Future<void> _init() async {
    try {
      // 설정·기록 저장소를 열지 못해도(저장 공간 문제 등) 문서는 읽을 수 있어야 한다.
      ReaderStore? store;
      try {
        store = await ReaderStore.open();
        store.addRecent(
          RecentEntry(
            path: widget.document.path,
            name: widget.document.name,
            size: widget.document.size,
            openedAt: DateTime.now().millisecondsSinceEpoch,
          ),
        );
      } catch (_) {
        store = null;
      }
      final raw = await readTextFile(File(widget.document.path));
      if (!mounted) return;
      setState(() {
        _store = store;
        _s = store?.settings ?? _s;
        _raw = raw;
        _text = ReaderText.build(raw, joinLines: _s.joinLines);
      });
      ScreenAwake.set(_s.keepScreenOn);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = '파일을 읽을 수 없습니다.');
    }
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    _autoHide?.cancel();
    ScreenAwake.set(false);
    _scroll.removeListener(_onScroll);
    _store?.save();
    _scroll.dispose();
    _progress.dispose();
    _measureProgress.dispose();
    _searchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  // ───────────────────────── 레이아웃(문단 높이 측정) ─────────────────────────

  TextStyle _style(ReaderSettings s) => TextStyle(
    inherit: false,
    color: Color(s.text),
    fontSize: s.fontSize,
    height: s.lineHeight,
    letterSpacing: s.letterSpacing,
    fontFamily: s.fontFamily,
    fontWeight: FontWeight.normal,
    decoration: TextDecoration.none,
  );

  // 줄 높이를 글꼴과 상관없이 일정하게 고정해, 미리 잰 높이와 실제 그린 높이가 어긋나지 않게 한다.
  StrutStyle _strut(ReaderSettings s) => StrutStyle(
    fontSize: s.fontSize,
    height: s.lineHeight,
    fontFamily: s.fontFamily,
    forceStrutHeight: true,
  );

  double _gap(ReaderSettings s) => s.paragraphGap * s.fontSize * s.lineHeight;

  /// 현재 화면 맨 위 문단의 원문 위치. 아직 레이아웃 전이면 저장된 읽던 위치.
  int _currentOffset() {
    final text = _text;
    if (text == null) return 0;
    if (_extents.length != text.length || !_scroll.hasClients) {
      return _store?.positions[_key] ?? 0;
    }
    return text.starts[_topIndex()];
  }

  int _topIndex() {
    var lo = 0;
    var hi = _extents.length - 1;
    final target = _scroll.offset + 1;
    while (lo < hi) {
      final mid = (lo + hi + 1) >> 1;
      if (_offsets[mid] <= target) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  Future<void> _layout(double width, {int? anchor}) async {
    final text = _text;
    if (text == null) return;
    final gen = ++_layoutGen;
    _layoutWidth = width;
    final anchorOffset = anchor ?? _currentOffset();
    setState(() => _measuring = true);
    _measureProgress.value = 0;

    final s = _s;
    final style = _style(s);
    final painter = TextPainter(
      textDirection: TextDirection.ltr,
      textScaler: TextScaler.noScaling,
      strutStyle: _strut(s),
    );
    final gap = _gap(s);
    final n = text.length;
    final extents = List<double>.filled(n, 0);
    for (var i = 0; i < n; i++) {
      final p = text.paragraphs[i];
      painter.text = TextSpan(text: p.isEmpty ? ' ' : p, style: style);
      painter.layout(maxWidth: width);
      extents[i] = painter.height.ceilToDouble() + gap;
      if (i % 200 == 199) {
        _measureProgress.value = i / n;
        await Future<void>.delayed(Duration.zero); // 측정 중에도 화면이 멈추지 않게 양보한다.
        if (!mounted || gen != _layoutGen) {
          painter.dispose();
          return;
        }
      }
    }
    painter.dispose();

    final offsets = List<double>.filled(n + 1, 0);
    for (var i = 0; i < n; i++) {
      offsets[i + 1] = offsets[i] + extents[i];
    }
    setState(() {
      _extents = extents;
      _offsets = offsets;
      _measuring = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || gen != _layoutGen) return;
      _jumpToOffset(anchorOffset);
      if (!_firstLayoutDone) {
        _firstLayoutDone = true;
        _autoHide = Timer(const Duration(milliseconds: 2500), () {
          if (mounted && !_searching) _hideBars();
        });
        final query = widget.initialQuery;
        if (query != null && query.isNotEmpty) {
          _searchController.text = query;
          setState(() => _searching = true);
          _runSearch(query);
        }
      }
    });
  }

  void _jumpToOffset(int charOffset) {
    final text = _text;
    if (text == null || !_scroll.hasClients || _extents.length != text.length) {
      return;
    }
    final target = _offsets[text.paragraphIndexAt(charOffset)];
    final pos = _scroll.position;
    _scroll.jumpTo(target.clamp(pos.minScrollExtent, pos.maxScrollExtent));
  }

  // ───────────────────────── 스크롤·넘김 ─────────────────────────

  void _onScroll() {
    if (_measuring || !_scroll.hasClients || _extents.isEmpty) return;
    final pos = _scroll.position;
    final max = pos.maxScrollExtent;
    _progress.value = max > 0 ? (pos.pixels / max).clamp(0.0, 1.0) : 1;
    final text = _text;
    final store = _store;
    if (text != null && store != null && _extents.length == text.length) {
      store.setPosition(_key, text.starts[_topIndex()]);
    }
  }

  /// [direction]이 1이면 다음, -1이면 이전 화면. 한 번에 [ReaderSettings.pageRatio]만큼 넘어간다.
  void _page(int direction, {Duration duration = const Duration(milliseconds: 220)}) {
    if (!_scroll.hasClients) return;
    final pos = _scroll.position;
    final target =
        (pos.pixels + direction * pos.viewportDimension * _s.pageRatio).clamp(
          pos.minScrollExtent,
          pos.maxScrollExtent,
        );
    _scroll.animateTo(
      target,
      duration: duration,
      curve: Curves.easeOutCubic,
    );
  }

  /// 길게 누르는 동안 탭을 연달아 누르듯 한 화면씩 계속 넘긴다.
  ///
  /// 길게 누르기가 인식되는 순간 한 화면을 먼저 넘기고(그 전에는 탭이 발생하지 않는다),
  /// 이후 [ReaderSettings.holdSpeed]에 따라 초당 N화면씩 반복한다. 스크롤처럼 부드럽게
  /// 미끄러지지 않고, 매번 한 쪽 단위로 끊어 넘어간다. 끝에 닿으면 멈춘다.
  void _startHold(int direction) {
    _stopHold();
    if (!_scroll.hasClients) return;
    HapticFeedback.selectionClick();
    if (_showBars) setState(() => _showBars = false);

    final intervalMs = math.max(150, math.min(3000, (1000 / _s.holdSpeed).round()));
    // 다음 쪽 넘김이 시작되기 전에 이동 애니메이션이 끝나야 위치가 어긋나지 않는다.
    final duration = Duration(milliseconds: math.min(220, (intervalMs * 0.75).round()));

    void step() {
      if (!_scroll.hasClients) return _stopHold();
      final pos = _scroll.position;
      final atEdge = direction > 0
          ? pos.pixels >= pos.maxScrollExtent - 0.5
          : pos.pixels <= pos.minScrollExtent + 0.5;
      if (atEdge) return _stopHold();
      _page(direction, duration: duration);
    }

    step();
    _holdTimer = Timer.periodic(Duration(milliseconds: intervalMs), (_) => step());
  }

  void _stopHold() {
    _holdTimer?.cancel();
    _holdTimer = null;
  }

  void _onTap(double dy, double height) {
    _autoHide?.cancel(); // 사용자가 직접 조작하면 자동 숨김은 그만둔다.
    if (_s.tapPaging && !_searching) {
      if (dy > height * (1 - _tapZone)) {
        _hideBars();
        return _page(1);
      }
      if (dy < height * _tapZone) {
        _hideBars();
        return _page(-1);
      }
    }
    setState(() => _showBars = !_showBars);
  }

  void _hideBars() {
    if (_showBars) setState(() => _showBars = false);
  }

  void _onLongPressStart(double dy, double height) {
    if (!_s.tapPaging) return;
    if (dy > height * (1 - _tapZone)) return _startHold(1);
    if (dy < height * _tapZone) _startHold(-1);
  }

  // ───────────────────────── 설정 ─────────────────────────

  void _applySettings(ReaderSettings next, {required bool relayout}) {
    final anchor = _currentOffset(); // 원문 위치는 문단을 다시 나누기 전에 읽어 둔다.
    final rejoin = next.joinLines != _s.joinLines;
    final keepChanged = next.keepScreenOn != _s.keepScreenOn;
    final raw = _raw;
    setState(() {
      _s = next;
      if (rejoin && raw != null) {
        _text = ReaderText.build(raw, joinLines: next.joinLines);
        _clearSearchResults();
      }
    });
    _store
      ?..settings = next
      ..saveSoon();
    if (keepChanged) ScreenAwake.set(next.keepScreenOn);
    if (relayout || rejoin) {
      _layout(_layoutWidth, anchor: anchor);
      if (_query.isNotEmpty) _runSearch(_query, jump: false);
    }
  }

  void _openSettings() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      barrierColor: Colors.black12,
      showDragHandle: true,
      builder: (_) =>
          ReaderSettingsSheet(settings: _s, onChanged: _applySettings),
    );
  }

  void _toggleBlueLight() => _applySettings(
    _s.copyWith(blueLight: _s.blueLight > 0 ? 0 : 0.35),
    relayout: false,
  );

  // ───────────────────────── 검색 ─────────────────────────

  void _clearSearchResults() {
    _hits = const [];
    _hitsByParagraph = const {};
    _hitIndex = -1;
  }

  void _runSearch(String query, {bool jump = true}) {
    final text = _text;
    if (text == null) return;
    final hits = text.search(query);
    final byParagraph = <int, List<(int, SearchHit)>>{};
    for (var i = 0; i < hits.length; i++) {
      byParagraph.putIfAbsent(hits[i].paragraph, () => []).add((i, hits[i]));
    }
    var index = -1;
    if (hits.isNotEmpty) {
      final top = _extents.length == text.length && _scroll.hasClients
          ? _topIndex()
          : 0;
      index = hits.indexWhere((h) => h.paragraph >= top);
      if (index < 0) index = 0;
    }
    setState(() {
      _query = query;
      _hits = hits;
      _hitsByParagraph = byParagraph;
      _hitIndex = index;
    });
    if (jump && index >= 0) _goToHit(index);
  }

  void _stepHit(int delta) {
    if (_hits.isEmpty) return;
    final next = (_hitIndex + delta) % _hits.length;
    setState(() => _hitIndex = next < 0 ? next + _hits.length : next);
    _goToHit(_hitIndex);
  }

  /// 찾은 단어가 화면 위쪽 30% 지점에 오도록 이동한다. 긴 문단 안의 위치까지 계산한다.
  void _goToHit(int index) {
    final text = _text;
    if (text == null || !_scroll.hasClients || _extents.length != text.length) {
      return;
    }
    final hit = _hits[index];
    final painter = TextPainter(
      text: TextSpan(text: text.paragraphs[hit.paragraph], style: _style(_s)),
      textDirection: TextDirection.ltr,
      textScaler: TextScaler.noScaling,
      strutStyle: _strut(_s),
    )..layout(maxWidth: _layoutWidth);
    final dy = painter
        .getOffsetForCaret(TextPosition(offset: hit.start), Rect.zero)
        .dy;
    painter.dispose();
    final pos = _scroll.position;
    final target = (_offsets[hit.paragraph] + dy - pos.viewportDimension * 0.3)
        .clamp(pos.minScrollExtent, pos.maxScrollExtent);
    _scroll.animateTo(
      target,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
    );
  }

  void _closeSearch() {
    _searchFocus.unfocus();
    setState(() {
      _searching = false;
      _query = '';
      _searchController.clear();
      _clearSearchResults();
    });
  }

  // ───────────────────────── 책갈피 ─────────────────────────

  bool get _hasBookmarkHere {
    final text = _text;
    final store = _store;
    if (text == null ||
        store == null ||
        _extents.length != text.length ||
        !_scroll.hasClients) {
      return false;
    }
    final i = _topIndex();
    final from = text.starts[i];
    final to = i + 1 < text.length ? text.starts[i + 1] : 1 << 62;
    return store
        .bookmarksOf(_key)
        .any((b) => b.offset >= from && b.offset < to);
  }

  void _addBookmark() {
    final text = _text;
    final store = _store;
    if (text == null || store == null || _extents.length != text.length) return;
    final i = _topIndex();
    final offset = text.starts[i];
    final list = store.bookmarksOf(_key);
    if (list.any((b) => b.offset == offset)) return;
    final preview = text.paragraphs[i].trim();
    list.add(
      Bookmark(
        offset: offset,
        label: preview.isEmpty
            ? '(빈 줄)'
            : (preview.length > 40 ? '${preview.substring(0, 40)}…' : preview),
        createdAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
    list.sort((a, b) => a.offset.compareTo(b.offset));
    store.saveSoon();
  }

  void _openBookmarks() {
    final store = _store;
    final text = _text;
    if (store == null || text == null) return;
    final totalChars = math.max(
      1,
      text.starts.last + text.paragraphs.last.length,
    );
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheet) {
          final list = store.bookmarksOf(_key);
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.7,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () {
                          _addBookmark();
                          setSheet(() {});
                          setState(() {});
                        },
                        icon: const Icon(Icons.bookmark_add_outlined),
                        label: const Text('현재 위치에 책갈피 추가'),
                      ),
                    ),
                  ),
                  if (list.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Text('저장된 책갈피가 없습니다.'),
                    )
                  else
                    Flexible(
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: list.length,
                        itemBuilder: (context, index) {
                          final b = list[index];
                          return ListTile(
                            leading: const Icon(Icons.bookmark),
                            title: Text(
                              b.label,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              '${(b.offset * 100 / totalChars).toStringAsFixed(1)}% 지점',
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline),
                              tooltip: '삭제',
                              onPressed: () {
                                list.removeAt(index);
                                store.saveSoon();
                                setSheet(() {});
                                setState(() {});
                              },
                            ),
                            onTap: () {
                              Navigator.of(sheetContext).pop();
                              _jumpToOffset(b.offset);
                              _hideBars();
                            },
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ───────────────────────── 화면 ─────────────────────────

  InlineSpan _spanFor(int index, String paragraph, TextStyle style) {
    final hits = _hitsByParagraph[index];
    if (hits == null) {
      return TextSpan(text: paragraph.isEmpty ? ' ' : paragraph, style: style);
    }
    final children = <InlineSpan>[];
    var at = 0;
    for (final (hitNumber, hit) in hits) {
      if (hit.start > at) {
        children.add(TextSpan(text: paragraph.substring(at, hit.start)));
      }
      children.add(
        TextSpan(
          text: paragraph.substring(hit.start, hit.end),
          style: TextStyle(
            backgroundColor: hitNumber == _hitIndex
                ? const Color(0xFFFF9800)
                : const Color(0xFFFFEB3B),
            color: Colors.black,
          ),
        ),
      );
      at = hit.end;
    }
    if (at < paragraph.length) {
      children.add(TextSpan(text: paragraph.substring(at)));
    }
    return TextSpan(style: style, children: children);
  }

  @override
  Widget build(BuildContext context) {
    final bg = Color(_s.background);
    final fg = Color(_s.text);
    final media = MediaQuery.of(context);

    Widget content;
    if (_error != null) {
      content = Center(
        child: Text(_error!, style: TextStyle(color: fg)),
      );
    } else if (_text == null) {
      content = const Center(child: CircularProgressIndicator());
    } else {
      content = LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth - 2 * _s.horizontalPadding;
          if ((width - _layoutWidth).abs() > 0.5) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted && (width - _layoutWidth).abs() > 0.5) _layout(width);
            });
          }
          // 상태 표시줄 영역은 비워 둔다. 그래야 스크롤된 글자가 시계·배터리 아이콘 뒤로 지나가지 않는다.
          return Padding(
            padding: EdgeInsets.only(top: media.padding.top),
            child: _buildReader(
              constraints.maxHeight - media.padding.top,
              media,
            ),
          );
        },
      );
    }

    Widget body = Stack(
      key: _bodyKey,
      children: [
        Positioned.fill(child: content),
        if (_text != null) ..._buildBars(bg, fg),
      ],
    );
    if (_s.blueLight > 0) {
      body = ColorFiltered(
        colorFilter: ColorFilter.mode(
          Color.lerp(Colors.white, _warmColor, _s.blueLight)!,
          BlendMode.modulate,
        ),
        child: body,
      );
    }
    if (_s.dim > 0) {
      body = Stack(
        children: [
          Positioned.fill(child: body),
          Positioned.fill(
            child: IgnorePointer(
              child: ColoredBox(color: Colors.black.withValues(alpha: _s.dim)),
            ),
          ),
        ],
      );
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: _s.isLightBackground
            ? Brightness.dark
            : Brightness.light,
        systemNavigationBarColor: bg,
        systemNavigationBarIconBrightness: _s.isLightBackground
            ? Brightness.dark
            : Brightness.light,
      ),
      // 검색 중에 뒤로 가기를 누르면 문서를 닫지 않고 검색부터 닫는다.
      child: PopScope(
        canPop: !_searching,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _closeSearch();
        },
        child: Scaffold(backgroundColor: bg, body: body),
      ),
    );
  }

  Widget _buildReader(double height, MediaQueryData media) {
    final text = _text!;
    final style = _style(_s);
    final strut = _strut(_s);
    final gap = _gap(_s);
    final ready = !_measuring && _extents.length == text.length;
    return Stack(
      children: [
        if (ready)
          GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTapUp: (d) => _onTap(d.localPosition.dy, height),
            onLongPressStart: (d) =>
                _onLongPressStart(d.localPosition.dy, height),
            onLongPressEnd: (_) => _stopHold(),
            onLongPressCancel: _stopHold,
            child: NotificationListener<UserScrollNotification>(
              onNotification: (n) {
                if (n.direction != ScrollDirection.idle &&
                    _showBars &&
                    !_searching) {
                  _hideBars();
                }
                return false;
              },
              child: ListView.builder(
                controller: _scroll,
                padding: EdgeInsets.fromLTRB(
                  0,
                  12,
                  0,
                  media.padding.bottom + 40,
                ),
                itemCount: text.length,
                itemExtentBuilder: (index, _) => _extents[index],
                itemBuilder: (context, index) => Padding(
                  padding: EdgeInsets.fromLTRB(
                    _s.horizontalPadding,
                    0,
                    _s.horizontalPadding,
                    gap,
                  ),
                  child: Text.rich(
                    _spanFor(index, text.paragraphs[index], style),
                    strutStyle: strut,
                    textScaler: TextScaler.noScaling,
                  ),
                ),
              ),
            ),
          ),
        if (ready && (_raw?.trim().isEmpty ?? false))
          Positioned.fill(
            child: IgnorePointer(
              child: Center(
                child: Text(
                  '내용이 없는 파일입니다.',
                  style: TextStyle(
                    color: Color(_s.text).withValues(alpha: 0.6),
                  ),
                ),
              ),
            ),
          ),
        if (!ready)
          Positioned.fill(
            child: ColoredBox(
              color: Color(_s.background),
              child: Center(
                child: ValueListenableBuilder<double>(
                  valueListenable: _measureProgress,
                  builder: (context, value, _) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(
                        value: value > 0 ? value : null,
                        color: Color(_s.text),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        '글자 배치를 계산하는 중…',
                        style: TextStyle(
                          color: Color(_s.text).withValues(alpha: 0.7),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        if (ready)
          Positioned(
            right: 14,
            bottom: media.padding.bottom + 6,
            child: IgnorePointer(
              child: ValueListenableBuilder<double>(
                valueListenable: _progress,
                builder: (context, value, _) => Text(
                  '${(value * 100).round()}%',
                  style: TextStyle(
                    fontSize: 11,
                    color: Color(_s.text).withValues(alpha: 0.45),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  List<Widget> _buildBars(Color bg, Color fg) {
    final barColor = Color.alphaBlend(fg.withValues(alpha: 0.08), bg);
    final media = MediaQuery.of(context);
    return [
      Positioned(
        top: 0,
        left: 0,
        right: 0,
        child: IgnorePointer(
          ignoring: !_showBars && !_searching,
          child: AnimatedSlide(
            offset: _showBars || _searching ? Offset.zero : const Offset(0, -1),
            duration: const Duration(milliseconds: 180),
            child: Material(
              color: barColor,
              elevation: 3,
              child: Padding(
                padding: EdgeInsets.only(top: media.padding.top),
                child: SizedBox(
                  height: kToolbarHeight,
                  child: _searching ? _searchBar(fg) : _topBar(fg),
                ),
              ),
            ),
          ),
        ),
      ),
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: IgnorePointer(
          ignoring: !_showBars || _searching,
          child: AnimatedSlide(
            offset: _showBars && !_searching ? Offset.zero : const Offset(0, 1),
            duration: const Duration(milliseconds: 180),
            child: Material(
              color: barColor,
              elevation: 3,
              child: Padding(
                padding: EdgeInsets.only(bottom: media.padding.bottom),
                child: SizedBox(height: 56, child: _bottomBar(fg)),
              ),
            ),
          ),
        ),
      ),
    ];
  }

  Widget _topBar(Color fg) => IconTheme(
    data: IconThemeData(color: fg),
    child: Row(
      children: [
        IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        Expanded(
          child: Text(
            widget.document.name,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: fg,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.search),
          tooltip: '본문 검색',
          onPressed: () {
            setState(() => _searching = true);
            _searchFocus.requestFocus();
          },
        ),
        IconButton(
          icon: Icon(_hasBookmarkHere ? Icons.bookmark : Icons.bookmark_border),
          tooltip: '책갈피',
          onPressed: _openBookmarks,
        ),
        IconButton(
          icon: const Icon(Icons.text_fields),
          tooltip: '보기 설정',
          onPressed: _openSettings,
        ),
      ],
    ),
  );

  Widget _searchBar(Color fg) => IconTheme(
    data: IconThemeData(color: fg),
    child: Row(
      children: [
        IconButton(
          icon: const Icon(Icons.close),
          tooltip: '검색 닫기',
          onPressed: _closeSearch,
        ),
        Expanded(
          child: TextField(
            controller: _searchController,
            focusNode: _searchFocus,
            autofocus: true,
            style: TextStyle(color: fg),
            cursorColor: fg,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: '본문에서 찾기',
              hintStyle: TextStyle(color: fg.withValues(alpha: 0.5)),
              border: InputBorder.none,
            ),
            onChanged: (q) => q.isEmpty
                ? setState(() {
                    _query = '';
                    _clearSearchResults();
                  })
                : _runSearch(q, jump: false),
            onSubmitted: (q) {
              if (q.isEmpty) return;
              if (q == _query && _hits.isNotEmpty) {
                _stepHit(1);
              } else {
                _runSearch(q);
              }
            },
          ),
        ),
        if (_query.isNotEmpty)
          Text(
            _hits.isEmpty
                ? '없음'
                : '${_hitIndex + 1}/${_hits.length}${_hits.length >= 5000 ? '+' : ''}',
            style: TextStyle(color: fg, fontSize: 13),
          ),
        IconButton(
          icon: const Icon(Icons.keyboard_arrow_up),
          tooltip: '이전',
          onPressed: () => _stepHit(-1),
        ),
        IconButton(
          icon: const Icon(Icons.keyboard_arrow_down),
          tooltip: '다음',
          onPressed: () => _stepHit(1),
        ),
      ],
    ),
  );

  Widget _bottomBar(Color fg) => IconTheme(
    data: IconThemeData(color: fg),
    child: Row(
      children: [
        const SizedBox(width: 12),
        ValueListenableBuilder<double>(
          valueListenable: _progress,
          builder: (context, value, _) => SizedBox(
            width: 44,
            child: Text(
              '${(value * 100).round()}%',
              style: TextStyle(color: fg, fontSize: 13),
            ),
          ),
        ),
        Expanded(
          child: ValueListenableBuilder<double>(
            valueListenable: _progress,
            builder: (context, value, _) => Slider(
              value: value.clamp(0.0, 1.0),
              onChanged: (v) {
                if (!_scroll.hasClients) return;
                _scroll.jumpTo(v * _scroll.position.maxScrollExtent);
              },
            ),
          ),
        ),
        IconButton(
          icon: Icon(
            _s.blueLight > 0 ? Icons.visibility : Icons.visibility_outlined,
          ),
          tooltip: '눈 보호(블루라이트 줄이기)',
          color: _s.blueLight > 0 ? _warmColor : null,
          onPressed: _toggleBlueLight,
        ),
      ],
    ),
  );
}
