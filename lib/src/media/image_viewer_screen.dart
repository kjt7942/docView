import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:exif/exif.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../document.dart';
import '../system_bars.dart';
import 'device_media.dart';

/// 사진 보기(안드로이드 기본 갤러리 수준).
///
/// - 두 손가락으로 확대/축소, 두 번 탭으로 누른 곳 확대, 확대한 채 끌어서 이동
/// - 좌우로 넘겨 다른 사진 보기(확대 중에는 이동만), 위아래로 끌어 닫기
/// - 90° 회전, 사진 정보(해상도·크기·촬영 정보 EXIF), 공유, 슬라이드쇼
/// - 화면을 누르면 위아래 막대가 사라지고 검은 배경으로 꽉 차게 보여 준다
class ImageViewerScreen extends StatefulWidget {
  const ImageViewerScreen({
    super.key,
    required this.images,
    this.initialIndex = 0,
  });

  final List<DocumentFile> images;
  final int initialIndex;

  @override
  State<ImageViewerScreen> createState() => _ImageViewerScreenState();
}

class _ImageViewerScreenState extends State<ImageViewerScreen> {
  late final PageController _pages = PageController(initialPage: _index);
  late int _index = widget.initialIndex < 0
      ? 0
      : (widget.initialIndex >= widget.images.length
            ? widget.images.length - 1
            : widget.initialIndex);

  final Map<int, int> _turns = {};
  bool _chrome = false;
  bool _zoomed = false;
  Timer? _slideshow;
  double _dismissDy = 0;

  DocumentFile get _current => widget.images[_index];

  @override
  void initState() {
    super.initState();
    SystemBars.show(false);
  }

  @override
  void dispose() {
    _slideshow?.cancel();
    _pages.dispose();
    SystemBars.show(true);
    super.dispose();
  }

  void _toggleChrome() {
    if (_slideshow != null) {
      _stopSlideshow();
      return;
    }
    setState(() => _chrome = !_chrome);
  }

  void _rotate() {
    setState(() => _turns[_index] = ((_turns[_index] ?? 0) + 1) % 4);
  }

  void _startSlideshow() {
    if (widget.images.length < 2) return;
    setState(() => _chrome = false);
    _slideshow = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!mounted) return;
      final next = (_index + 1) % widget.images.length;
      if (next == 0) {
        _pages.jumpToPage(0);
      } else {
        _pages.nextPage(
          duration: const Duration(milliseconds: 450),
          curve: Curves.easeInOut,
        );
      }
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('슬라이드쇼 — 화면을 누르면 멈춥니다'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  void _stopSlideshow() {
    _slideshow?.cancel();
    _slideshow = null;
    setState(() => _chrome = true);
  }

  Future<void> _share() async {
    final ok = await DeviceMedia.share(_current.path, _mimeOf(_current));
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('공유할 수 없습니다.')),
      );
    }
  }

  static String _mimeOf(DocumentFile d) => switch (d.extension) {
    'png' => 'image/png',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'bmp' => 'image/bmp',
    'heic' => 'image/heic',
    _ => 'image/jpeg',
  };

  Future<void> _showInfo() async {
    final doc = _current;
    final info = await _ImageInfoData.load(doc);
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.75,
          ),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            children: [
              Text(
                '사진 정보',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              for (final row in info.rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 96,
                        child: Text(
                          row.$1,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                      Expanded(child: SelectableText(row.$2)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 위아래 막대가 보일 때만 시스템 내비게이션 버튼도 보인다.
    SystemBars.show(_chrome);
    final padding = MediaQuery.paddingOf(context);
    final total = widget.images.length;
    final dismissProgress = (_dismissDy.abs() / 300).clamp(0.0, 1.0);
    return Scaffold(
      backgroundColor: Colors.black.withValues(alpha: 1 - dismissProgress * 0.7),
      body: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              // 확대하지 않았을 때 위아래로 끌면 닫힌다(갤러리 앱과 같은 동작).
              onVerticalDragUpdate: _zoomed
                  ? null
                  : (d) => setState(() => _dismissDy += d.delta.dy),
              onVerticalDragEnd: _zoomed
                  ? null
                  : (d) {
                      if (_dismissDy.abs() > 140 ||
                          (d.primaryVelocity ?? 0).abs() > 900) {
                        Navigator.of(context).maybePop();
                      } else {
                        setState(() => _dismissDy = 0);
                      }
                    },
              child: Transform.translate(
                offset: Offset(0, _dismissDy),
                child: Transform.scale(
                  scale: 1 - dismissProgress * 0.25,
                  child: PageView.builder(
                    controller: _pages,
                    physics: _zoomed
                        ? const NeverScrollableScrollPhysics()
                        : const PageScrollPhysics(),
                    itemCount: total,
                    onPageChanged: (i) => setState(() {
                      _index = i;
                      _zoomed = false;
                    }),
                    itemBuilder: (context, i) => _ZoomableImage(
                      key: ValueKey(widget.images[i].path),
                      file: File(widget.images[i].path),
                      quarterTurns: _turns[i] ?? 0,
                      onTap: _toggleChrome,
                      onZoomChanged: (zoomed) {
                        if (i == _index && zoomed != _zoomed) {
                          setState(() => _zoomed = zoomed);
                        }
                      },
                    ),
                  ),
                ),
              ),
            ),
          ),
          // 위
          AnimatedPositioned(
            duration: const Duration(milliseconds: 180),
            top: _chrome ? 0 : -(padding.top + kToolbarHeight + 8),
            left: 0,
            right: 0,
            child: Container(
              padding: EdgeInsets.only(top: padding.top),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xB3000000), Color(0x00000000)],
                ),
              ),
              child: SizedBox(
                height: kToolbarHeight,
                child: Row(
                  children: [
                    const BackButton(color: Colors.white),
                    Expanded(
                      child: Text(
                        _current.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 16),
                      ),
                    ),
                    if (total > 1)
                      Padding(
                        padding: const EdgeInsets.only(right: 16),
                        child: Text(
                          '${_index + 1} / $total',
                          style: const TextStyle(color: Colors.white70),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          // 아래
          AnimatedPositioned(
            duration: const Duration(milliseconds: 180),
            bottom: _chrome ? 0 : -(padding.bottom + 80),
            left: 0,
            right: 0,
            child: Container(
              padding: EdgeInsets.only(bottom: padding.bottom + 8, top: 16),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [Color(0xB3000000), Color(0x00000000)],
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _action(Icons.rotate_right, '회전', _rotate),
                  _action(Icons.info_outline, '정보', _showInfo),
                  _action(Icons.share_outlined, '공유', _share),
                  if (total > 1)
                    _action(Icons.slideshow_outlined, '슬라이드쇼', _startSlideshow),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _action(IconData icon, String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

/// 사진 한 장: 핀치 확대, 두 번 탭 확대/원래대로(애니메이션), 회전.
class _ZoomableImage extends StatefulWidget {
  const _ZoomableImage({
    super.key,
    required this.file,
    required this.quarterTurns,
    required this.onTap,
    required this.onZoomChanged,
  });

  final File file;
  final int quarterTurns;
  final VoidCallback onTap;
  final ValueChanged<bool> onZoomChanged;

  @override
  State<_ZoomableImage> createState() => _ZoomableImageState();
}

class _ZoomableImageState extends State<_ZoomableImage>
    with SingleTickerProviderStateMixin {
  final _transform = TransformationController();
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );
  Animation<Matrix4>? _tween;
  Offset _tapAt = Offset.zero;

  @override
  void initState() {
    super.initState();
    _anim.addListener(() {
      final t = _tween;
      if (t != null) _transform.value = t.value;
    });
    _transform.addListener(_reportZoom);
  }

  @override
  void didUpdateWidget(covariant _ZoomableImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.quarterTurns != widget.quarterTurns) {
      // 빌드 중에 부모 setState가 불리지 않도록, 알림은 다음 프레임에 보낸다.
      _transform.removeListener(_reportZoom);
      _transform.value = Matrix4.identity();
      _transform.addListener(_reportZoom);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _reportZoom();
      });
    }
  }

  void _reportZoom() {
    widget.onZoomChanged(_transform.value.getMaxScaleOnAxis() > 1.01);
  }

  @override
  void dispose() {
    _anim.dispose();
    _transform.dispose();
    super.dispose();
  }

  void _onDoubleTap() {
    final zoomed = _transform.value.getMaxScaleOnAxis() > 1.01;
    final Matrix4 end;
    if (zoomed) {
      end = Matrix4.identity();
    } else {
      const scale = 2.5;
      final p = _tapAt;
      end = Matrix4.identity()
        ..translateByDouble(-p.dx * (scale - 1), -p.dy * (scale - 1), 0, 1)
        ..scaleByDouble(scale, scale, 1, 1);
    }
    _tween = Matrix4Tween(begin: _transform.value, end: end).animate(
      CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic),
    );
    _anim.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onDoubleTapDown: (d) => _tapAt = d.localPosition,
      onDoubleTap: _onDoubleTap,
      child: InteractiveViewer(
        transformationController: _transform,
        minScale: 1,
        maxScale: 10,
        clipBehavior: Clip.none,
        child: SizedBox.expand(
          child: RotatedBox(
            quarterTurns: widget.quarterTurns,
            child: Image.file(
              widget.file,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.medium,
              gaplessPlayback: true,
              errorBuilder: (context, error, stack) => const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Text(
                    '이 이미지를 표시할 수 없습니다.\n지원하지 않는 형식이거나 손상된 파일입니다.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 정보 창에 보여 줄 값들.
class _ImageInfoData {
  _ImageInfoData(this.rows);

  final List<(String, String)> rows;

  static Future<_ImageInfoData> load(DocumentFile doc) async {
    final rows = <(String, String)>[('파일 이름', doc.name)];
    final file = File(doc.path);
    try {
      final bytes = await file.readAsBytes();
      rows.add(('파일 크기', _size(bytes.length)));

      try {
        final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
        final descriptor = await ui.ImageDescriptor.encoded(buffer);
        rows.add((
          '해상도',
          '${descriptor.width} × ${descriptor.height} '
              '(${(descriptor.width * descriptor.height / 1000000).toStringAsFixed(1)}MP)',
        ));
        descriptor.dispose();
        buffer.dispose();
      } catch (_) {
        // 해상도를 못 읽어도 나머지는 보여 준다.
      }

      final stat = await file.stat();
      rows.add(('수정한 날짜', _date(stat.modified)));

      final exif = await readExifFromBytes(bytes);
      String? tag(String name) {
        final v = exif[name]?.printable.trim();
        return v == null || v.isEmpty ? null : v;
      }

      final taken = tag('EXIF DateTimeOriginal') ?? tag('Image DateTime');
      if (taken != null) rows.add(('촬영 일시', _exifDate(taken)));
      final make = tag('Image Make');
      final model = tag('Image Model');
      if (model != null) {
        rows.add((
          '카메라',
          make != null && !model.toLowerCase().contains(make.toLowerCase())
              ? '$make $model'
              : model,
        ));
      }
      final lens = tag('EXIF LensModel');
      if (lens != null) rows.add(('렌즈', lens));
      final settings = [
        if (tag('EXIF FNumber') case final f?) 'f/${_ratio(f)}',
        if (tag('EXIF ExposureTime') case final t?) '${t}s',
        if (tag('EXIF ISOSpeedRatings') case final iso?) 'ISO $iso',
        if (tag('EXIF FocalLength') case final fl?) '${_ratio(fl)}mm',
      ];
      if (settings.isNotEmpty) rows.add(('촬영 설정', settings.join('  ·  ')));
      final flash = tag('EXIF Flash');
      if (flash != null) rows.add(('플래시', flash));

      final lat = _gps(exif['GPS GPSLatitude'], tag('GPS GPSLatitudeRef'));
      final lon = _gps(exif['GPS GPSLongitude'], tag('GPS GPSLongitudeRef'));
      if (lat != null && lon != null) {
        rows.add((
          '위치',
          '${lat.toStringAsFixed(6)}, ${lon.toStringAsFixed(6)}',
        ));
      }
    } catch (_) {
      // 읽기 실패: 이름만 보여 준다.
    }
    return _ImageInfoData(rows);
  }

  static String _size(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static String _two(int v) => v.toString().padLeft(2, '0');

  static String _date(DateTime d) =>
      '${d.year}-${_two(d.month)}-${_two(d.day)} ${_two(d.hour)}:${_two(d.minute)}';

  /// "2024:05:01 13:22:10" → "2024-05-01 13:22:10"
  static String _exifDate(String v) {
    final m = RegExp(r'^(\d{4}):(\d{2}):(\d{2})\s+(.*)$').firstMatch(v);
    return m == null ? v : '${m.group(1)}-${m.group(2)}-${m.group(3)} ${m.group(4)}';
  }

  /// "28/10" 같은 분수를 소수로.
  static String _ratio(String v) {
    final m = RegExp(r'^(\d+)/(\d+)$').firstMatch(v);
    if (m == null) return v;
    final den = int.parse(m.group(2)!);
    if (den == 0) return v;
    final value = int.parse(m.group(1)!) / den;
    return value == value.roundToDouble()
        ? value.toStringAsFixed(0)
        : value.toStringAsFixed(1);
  }

  static double? _gps(IfdTag? tag, String? ref) {
    final values = tag?.values.toList();
    if (values == null || values.length < 3) return null;
    double part(Object? v) {
      if (v is Ratio) return v.denominator == 0 ? 0 : v.numerator / v.denominator;
      if (v is num) return v.toDouble();
      return 0;
    }

    final deg = part(values[0]) + part(values[1]) / 60 + part(values[2]) / 3600;
    return (ref == 'S' || ref == 'W') ? -deg : deg;
  }
}
