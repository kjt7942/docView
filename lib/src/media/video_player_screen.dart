import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../document.dart';
import '../reader/reader_store.dart';
import '../reader/screen_awake.dart';
import 'device_media.dart';
import 'growing_file_server.dart';
import 'subtitles.dart';
import 'video_prefs.dart';

/// 화면 맞춤 방식.
enum VideoFit {
  contain('화면 맞춤'),
  cover('화면 채우기'),
  fill('늘이기'),
  wide('16:9'),
  standard('4:3');

  const VideoFit(this.label);
  final String label;
}

enum _DragKind { seek, brightness, volume }

/// 동영상·음악 플레이어(libmpv 기반 — 대부분의 코덱·컨테이너를 변환 없이 재생).
///
/// - 제스처: 좌우로 밀어 탐색, 왼쪽 위아래 밝기, 오른쪽 위아래 볼륨(최대 200% 증폭),
///   두 번 탭으로 앞/뒤 건너뛰기, 길게 눌러 2배속
/// - 자막: 내장/외부(SMI·SRT·ASS·SSA·VTT), 인코딩 자동 판별, 싱크·크기·위치 조절
/// - 오디오 트랙 선택·싱크, 재생 속도, A-B 반복, 화면 비율, 회전, 화면 잠금, PIP, 이어 보기
class VideoPlayerScreen extends StatefulWidget {
  const VideoPlayerScreen({
    super.key,
    required this.playlist,
    this.initialIndex = 0,
  });

  final List<DocumentFile> playlist;
  final int initialIndex;

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  final Player _player = Player(
    configuration: const PlayerConfiguration(bufferSize: 64 * 1024 * 1024),
  );
  VideoController? _controller;
  VideoPrefs? _prefs;
  ReaderStore? _store;
  final List<StreamSubscription<Object?>> _subs = [];

  late int _index = math.max(
    0,
    math.min(widget.initialIndex, widget.playlist.length - 1),
  );

  final _position = ValueNotifier<Duration>(Duration.zero);
  final _duration = ValueNotifier<Duration>(Duration.zero);
  final _playing = ValueNotifier<bool>(false);
  final _buffering = ValueNotifier<bool>(false);

  bool _controlsVisible = true;
  Timer? _hideTimer;
  bool _locked = false;
  bool _pip = false;
  bool _pipSupported = false;
  bool _audioOnly = false;
  bool _rotatedForThis = false;
  bool _landscape = false;

  // 가운데 안내(HUD)
  String? _hudText;
  IconData? _hudIcon;
  Timer? _hudTimer;

  // 이어 보기 안내
  Duration? _resumedAt;
  Timer? _resumeTimer;

  // 제스처
  _DragKind? _dragKind;
  Duration _dragBase = Duration.zero;
  Duration _dragTarget = Duration.zero;
  double _dragDx = 0;
  Offset? _doubleTapAt;
  double _rateBeforeBoost = 1;
  bool _boosting = false;

  double _brightness = 0.5;
  double _volume = 100;
  double _rate = 1;
  double _subDelay = 0;
  double _audioDelay = 0;
  VideoFit _fit = VideoFit.contain;
  Duration? _abA;
  Duration? _abB;
  double? _sliderDrag;
  Timer? _saveTimer;

  // 클라우드(content://) 파일 준비
  bool _preparing = false;
  String? _prepareId;
  int _prepareDone = 0;
  int _prepareTotal = -1;
  String? _error;

  // 받으면서 재생(클라우드 앱이 흐름으로만 넘겨줄 때)
  GrowingFileServer? _streamServer;
  String? _streamId;
  double? _streamProgress; // 0~1, 크기를 모르면 -1, 다 받으면 null

  DocumentFile get _current => widget.playlist[_index];

  String _posKey(DocumentFile d) =>
      'video:${ReaderStore.keyFor(d.name, d.size)}';

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    ScreenAwake.set(true);
    _setup();
  }

  Future<void> _setup() async {
    final prefs = await VideoPrefs.open();
    final store = await ReaderStore.open();
    _brightness = await DeviceMedia.brightness();
    _pipSupported = await DeviceMedia.pipSupported();
    if (!mounted) return;

    final controller = VideoController(
      _player,
      configuration: VideoControllerConfiguration(
        enableHardwareAcceleration: prefs.hardwareDecoding,
      ),
    );
    setState(() {
      _prefs = prefs;
      _store = store;
      _controller = controller;
    });

    _subs
      ..add(_player.stream.position.listen((p) => _position.value = p))
      ..add(_player.stream.duration.listen((d) => _duration.value = d))
      ..add(_player.stream.buffering.listen((b) => _buffering.value = b))
      ..add(
        _player.stream.playing.listen((p) {
          _playing.value = p;
          _updateAutoPip();
          if (p) _scheduleHide();
        }),
      )
      ..add(_player.stream.completed.listen((done) {
        if (done) _onCompleted();
      }))
      ..add(_player.stream.width.listen((_) => _onVideoSize()))
      ..add(_player.stream.height.listen((_) => _onVideoSize()))
      ..add(_player.stream.tracks.listen((_) => _checkAudioOnly()))
      ..add(
        _player.stream.error.listen((message) {
          if (message.isEmpty || !mounted) return;
          // 재생 중 잠깐 나는 경고까지 막지 않도록, 아직 재생이 시작되지 않았을 때만 오류 화면을 띄운다.
          if (_duration.value == Duration.zero) {
            setState(() => _error = message);
          } else {
            _showHud(Icons.error_outline, '재생 오류: $message');
          }
        }),
      )
      ..add(
        DeviceMedia.prepareProgress.listen((p) {
          if (!mounted) return;
          if (p.id == _prepareId) {
            setState(() {
              _prepareDone = p.done;
              _prepareTotal = p.total;
            });
          } else if (p.id == _streamId) {
            setState(() => _streamProgress = p.total > 0 ? p.done / p.total : -1);
          }
        }),
      )
      ..add(
        DeviceMedia.prepareDone.listen((d) {
          if (!mounted || d.id != _streamId) return;
          _streamServer?.markComplete(failed: !d.ok);
          setState(() => _streamProgress = null);
          if (!d.ok && d.error != 'canceled') {
            _showHud(Icons.cloud_off, '내려받기가 중단됐습니다: ${d.error ?? ''}', hold: const Duration(seconds: 3));
          }
        }),
      )
      ..add(
        DeviceMedia.pipChanges.listen((inPip) {
          if (!mounted) return;
          setState(() {
            _pip = inPip;
            if (inPip) _controlsVisible = false;
          });
        }),
      );

    _saveTimer = Timer.periodic(const Duration(seconds: 5), (_) => _saveProgress());
    await _open(_index);
  }

  Future<void> _setProp(String name, String value) async {
    final platform = _player.platform;
    if (platform is NativePlayer) {
      try {
        await platform.setProperty(name, value);
      } catch (_) {
        // 지원하지 않는 속성은 무시한다.
      }
    }
  }

  Future<void> _open(int index) async {
    _saveProgress();
    final doc = widget.playlist[index];
    setState(() {
      _index = index;
      _abA = null;
      _abB = null;
      _audioOnly = false;
      _rotatedForThis = false;
      _resumedAt = null;
      _subDelay = 0;
      _audioDelay = 0;
      _error = null;
    });
    _position.value = Duration.zero;
    _duration.value = Duration.zero;

    // content:// 는 재생 엔진이 UI 스레드에서 동기로 열어(클라우드 파일이면 다 받을 때까지) 앱이 멈춘다.
    // 백그라운드에서 먼저 열어 fd:// 나 받아 둔 파일 경로로 바꿔 넘긴다.
    var source = doc.path;
    _stopStream();
    if (source.startsWith('content://')) {
      await _player.stop();
      final id = '${DateTime.now().microsecondsSinceEpoch}';
      setState(() {
        _preparing = true;
        _prepareId = id;
        _prepareDone = 0;
        _prepareTotal = -1;
      });
      final r = await DeviceMedia.prepareMedia(source, id);
      if (!mounted || _prepareId != id) {
        // 화면을 닫았거나 다른 영상으로 넘어갔다: 열어 둔 파일은 닫는다.
        final fd = r.fd;
        if (fd != null) DeviceMedia.closeFd(fd);
        return;
      }
      setState(() {
        _preparing = false;
        _prepareId = null;
      });
      if (r.canceled) return;
      final fd = r.fd;
      final path = r.path;
      final stream = r.stream;
      if (stream != null) {
        // 받는 중인 파일을 루프백 서버로 흘려 재생 엔진이 바로 재생하게 한다.
        final server = await GrowingFileServer.start(File(stream), r.total);
        if (!mounted) {
          await server.close();
          DeviceMedia.cancelPrepare(id);
          return;
        }
        _streamServer = server;
        _streamId = id;
        setState(() => _streamProgress = r.total > 0 ? 0 : -1);
        source = server.url;
      } else if (fd != null) {
        // 이 fd는 재생 엔진(Media)이 다 쓰고 나면 스스로 닫는다.
        source = 'fd://$fd';
      } else if (path != null) {
        source = path;
      } else {
        setState(() => _error = r.error ?? '파일을 열 수 없습니다.');
        return;
      }
    }

    await _player.open(Media(source), play: true);
    await _setProp('volume-max', '200');
    await _setProp('hwdec', _prefs?.hardwareDecoding == false ? 'no' : 'auto-safe');
    await _setProp('sub-delay', '0');
    await _setProp('audio-delay', '0');
    await _setProp('ab-loop-a', 'no');
    await _setProp('ab-loop-b', 'no');
    await _player.setVolume(_volume);
    await _player.setRate(_rate);
    _applyFitProperty();

    // 이어 보기: 끝나기 직전이 아니면 지난 위치로 간다.
    final saved = _store?.positions[_posKey(doc)];
    if (saved != null && saved > 10000) {
      final dur = await _player.stream.duration
          .firstWhere((d) => d > Duration.zero)
          .timeout(const Duration(seconds: 8), onTimeout: () => Duration.zero);
      final at = Duration(milliseconds: saved);
      if (dur == Duration.zero || at < dur - const Duration(seconds: 10)) {
        await _player.seek(at);
        if (!mounted) return;
        setState(() => _resumedAt = at);
        _resumeTimer?.cancel();
        _resumeTimer = Timer(const Duration(seconds: 6), () {
          if (mounted) setState(() => _resumedAt = null);
        });
      }
    }
    Future<void>.delayed(const Duration(milliseconds: 1500), _checkAudioOnly);
    _scheduleHide();
  }

  void _checkAudioOnly() {
    if (!mounted) return;
    final videos = _player.state.tracks.video
        .where((t) => t.id != 'auto' && t.id != 'no')
        .toList();
    final w = _player.state.width ?? 0;
    final audioOnly =
        _current.format == DocumentFormat.audio || (videos.isEmpty && w == 0);
    if (audioOnly != _audioOnly) setState(() => _audioOnly = audioOnly);
  }

  void _onVideoSize() {
    final w = _player.state.width ?? 0;
    final h = _player.state.height ?? 0;
    if (w <= 0 || h <= 0) return;
    _updateAutoPip();
    if (_rotatedForThis || _prefs?.autoRotate == false) return;
    _rotatedForThis = true;
    _setLandscape(w > h);
  }

  void _setLandscape(bool landscape) {
    _landscape = landscape;
    SystemChrome.setPreferredOrientations(
      landscape
          ? const [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]
          : const [DeviceOrientation.portraitUp],
    );
  }

  void _updateAutoPip() {
    final w = _player.state.width ?? 16;
    final h = _player.state.height ?? 9;
    DeviceMedia.setAutoPip(
      _pipSupported && (_prefs?.autoPip ?? false) && _playing.value && !_audioOnly,
      width: w > 0 ? w : 16,
      height: h > 0 ? h : 9,
    );
  }

  void _saveProgress() {
    final store = _store;
    if (store == null || widget.playlist.isEmpty) return;
    final pos = _position.value;
    final dur = _duration.value;
    final key = _posKey(_current);
    if (dur > Duration.zero && pos > dur - const Duration(seconds: 10)) {
      if (store.positions.remove(key) != null) store.saveSoon();
      return;
    }
    if (pos > const Duration(seconds: 5)) {
      store.setPosition(key, pos.inMilliseconds);
    }
  }

  void _onCompleted() {
    final store = _store;
    if (store != null && store.positions.remove(_posKey(_current)) != null) {
      store.saveSoon();
    }
    if (_abA != null && _abB != null) return;
    if ((_prefs?.autoNext ?? true) && _index < widget.playlist.length - 1) {
      _open(_index + 1);
    } else if (mounted) {
      setState(() => _controlsVisible = true);
    }
  }

  /// 받으면서 재생하던 이전 영상의 내려받기·서버를 정리한다.
  void _stopStream() {
    final id = _streamId;
    if (id != null) DeviceMedia.cancelPrepare(id);
    _streamId = null;
    _streamServer?.close();
    _streamServer = null;
    _streamProgress = null;
  }

  @override
  void dispose() {
    final pending = _prepareId;
    if (pending != null) DeviceMedia.cancelPrepare(pending);
    _prepareId = null;
    _stopStream();
    _saveProgress();
    _store?.save();
    _hideTimer?.cancel();
    _hudTimer?.cancel();
    _resumeTimer?.cancel();
    _saveTimer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    _player.dispose();
    _position.dispose();
    _duration.dispose();
    _playing.dispose();
    _buffering.dispose();
    DeviceMedia.setAutoPip(false);
    DeviceMedia.setBrightness(null);
    ScreenAwake.set(false);
    SystemChrome.setPreferredOrientations(const []);
    SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.manual,
      overlays: const [SystemUiOverlay.top],
    );
    super.dispose();
  }

  // ───────── 표시 ─────────

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && _playing.value && _sliderDrag == null) {
        setState(() => _controlsVisible = false);
      }
    });
  }

  void _toggleControls() {
    setState(() => _controlsVisible = !_controlsVisible);
    if (_controlsVisible) _scheduleHide();
  }

  void _showHud(IconData icon, String text, {Duration? hold}) {
    _hudTimer?.cancel();
    setState(() {
      _hudIcon = icon;
      _hudText = text;
    });
    _hudTimer = Timer(hold ?? const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _hudText = null);
    });
  }

  // ───────── 재생 조작 ─────────

  Future<void> _seekBy(int seconds) async {
    final dur = _duration.value;
    var target = _position.value + Duration(seconds: seconds);
    if (target < Duration.zero) target = Duration.zero;
    if (dur > Duration.zero && target > dur) target = dur;
    await _player.seek(target);
    _showHud(
      seconds < 0 ? Icons.fast_rewind : Icons.fast_forward,
      '${seconds > 0 ? '+' : ''}$seconds초',
    );
  }

  Future<void> _setRate(double rate) async {
    _rate = double.parse(rate.clamp(0.25, 4.0).toStringAsFixed(2));
    await _player.setRate(_rate);
    if (mounted) setState(() {});
  }

  void _cycleFit() {
    final next = VideoFit.values[(_fit.index + 1) % VideoFit.values.length];
    setState(() => _fit = next);
    _applyFitProperty();
    _showHud(Icons.aspect_ratio, next.label);
  }

  void _applyFitProperty() {
    final override = switch (_fit) {
      VideoFit.wide => '16:9',
      VideoFit.standard => '4:3',
      _ => '-1',
    };
    _setProp('video-aspect-override', override);
  }

  BoxFit get _boxFit => switch (_fit) {
    VideoFit.cover => BoxFit.cover,
    VideoFit.fill => BoxFit.fill,
    _ => BoxFit.contain,
  };

  Future<void> _cycleAb() async {
    final pos = _position.value;
    if (_abA == null) {
      setState(() => _abA = pos);
      _showHud(Icons.repeat, 'A 지점 ${_fmt(pos)} — 한 번 더 누르면 B 지점');
    } else if (_abB == null) {
      if (pos <= _abA!) {
        _showHud(Icons.repeat, 'B 지점은 A 지점보다 뒤여야 합니다');
        return;
      }
      setState(() => _abB = pos);
      await _setProp('ab-loop-a', (_abA!.inMilliseconds / 1000).toStringAsFixed(3));
      await _setProp('ab-loop-b', (pos.inMilliseconds / 1000).toStringAsFixed(3));
      await _player.seek(_abA!);
      _showHud(Icons.repeat_on, 'A-B 구간 반복 (${_fmt(_abA!)} ~ ${_fmt(pos)})');
    } else {
      setState(() {
        _abA = null;
        _abB = null;
      });
      await _setProp('ab-loop-a', 'no');
      await _setProp('ab-loop-b', 'no');
      _showHud(Icons.repeat, '구간 반복 해제');
    }
  }

  Future<void> _enterPip() async {
    final w = _player.state.width ?? 16;
    final h = _player.state.height ?? 9;
    final ok = await DeviceMedia.enterPip(
      width: w > 0 ? w : 16,
      height: h > 0 ? h : 9,
    );
    if (!ok) _showHud(Icons.picture_in_picture_alt, '이 기기는 화면 속 화면을 지원하지 않습니다');
  }

  // ───────── 제스처 ─────────

  void _onDoubleTap(double width) {
    final at = _doubleTapAt;
    if (at == null) return;
    final secs = _prefs?.doubleTapSeconds ?? 10;
    if (at.dx < width * 0.35) {
      _seekBy(-secs);
    } else if (at.dx > width * 0.65) {
      _seekBy(secs);
    } else {
      _player.playOrPause();
    }
  }

  void _onHorizontalStart(DragStartDetails d) {
    _dragKind = _DragKind.seek;
    _dragBase = _position.value;
    _dragTarget = _dragBase;
    _dragDx = 0;
  }

  void _onHorizontalUpdate(DragUpdateDetails d, double width) {
    if (_dragKind != _DragKind.seek) return;
    _dragDx += d.delta.dx;
    final span = (_prefs?.swipeSeekSeconds ?? 90) * 1000;
    final deltaMs = (_dragDx / width * span).round();
    final dur = _duration.value;
    var target = _dragBase + Duration(milliseconds: deltaMs);
    if (target < Duration.zero) target = Duration.zero;
    if (dur > Duration.zero && target > dur) target = dur;
    _dragTarget = target;
    final diff = (target - _dragBase).inSeconds;
    _hudTimer?.cancel();
    setState(() {
      _hudIcon = diff < 0 ? Icons.fast_rewind : Icons.fast_forward;
      _hudText =
          '${_fmt(target)} / ${_fmt(dur)}\n${diff >= 0 ? '+' : '-'}${_fmt(Duration(seconds: diff.abs()))}';
    });
  }

  void _onHorizontalEnd(DragEndDetails d) {
    if (_dragKind == _DragKind.seek) _player.seek(_dragTarget);
    _dragKind = null;
    _hudTimer = Timer(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => _hudText = null);
    });
  }

  void _onVerticalStart(DragStartDetails d, double width) {
    _dragKind = d.localPosition.dx < width / 2 ? _DragKind.brightness : _DragKind.volume;
  }

  void _onVerticalUpdate(DragUpdateDetails d, double height) {
    final delta = -d.delta.dy / (height * 0.7);
    if (_dragKind == _DragKind.brightness) {
      _brightness = (_brightness + delta).clamp(0.01, 1.0);
      DeviceMedia.setBrightness(_brightness);
      _hudTimer?.cancel();
      setState(() {
        _hudIcon = Icons.brightness_6;
        _hudText = '밝기 ${(_brightness * 100).round()}%';
      });
    } else if (_dragKind == _DragKind.volume) {
      _volume = (_volume + delta * 200).clamp(0.0, 200.0);
      _player.setVolume(_volume);
      _hudTimer?.cancel();
      setState(() {
        _hudIcon = _volume == 0
            ? Icons.volume_off
            : _volume > 100
            ? Icons.campaign
            : Icons.volume_up;
        _hudText = _volume > 100
            ? '볼륨 ${_volume.round()}% (증폭)'
            : '볼륨 ${_volume.round()}%';
      });
    }
  }

  void _onVerticalEnd(DragEndDetails d) {
    _dragKind = null;
    _hudTimer = Timer(const Duration(milliseconds: 600), () {
      if (mounted) setState(() => _hudText = null);
    });
  }

  void _onLongPressStart(LongPressStartDetails d) {
    if (!_playing.value) return;
    _boosting = true;
    _rateBeforeBoost = _rate;
    _player.setRate(2.0);
    _hudTimer?.cancel();
    setState(() {
      _hudIcon = Icons.fast_forward;
      _hudText = '2배속 재생 중';
    });
  }

  void _onLongPressEnd(LongPressEndDetails d) {
    if (!_boosting) return;
    _boosting = false;
    _player.setRate(_rateBeforeBoost);
    setState(() => _hudText = null);
  }

  // ───────── 시트(자막·오디오·속도·설정) ─────────

  Future<T?> _sheet<T>(Widget Function(BuildContext, StateSetter) builder) {
    return showModalBottomSheet<T>(
      context: context,
      backgroundColor: const Color(0xFF1E1F22),
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Theme(
        data: ThemeData.dark(),
        child: StatefulBuilder(
          builder: (context, setSheet) => SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.8,
              ),
              child: SingleChildScrollView(child: builder(context, setSheet)),
            ),
          ),
        ),
      ),
    );
  }

  Widget _sheetTitle(String text) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
    child: Text(
      text,
      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
    ),
  );

  String _trackLabel(String? title, String? language, int n) {
    final parts = [
      if (title != null && title.isNotEmpty) title,
      if (language != null && language.isNotEmpty) language,
    ];
    return parts.isEmpty ? '트랙 $n' : parts.join(' · ');
  }

  Widget _delayRow(
    String label,
    double value,
    ValueChanged<double> onChanged,
  ) {
    Widget step(String text, double d) => TextButton(
      onPressed: () => onChanged(double.parse((value + d).toStringAsFixed(1))),
      child: Text(text),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          SizedBox(width: 64, child: Text(label)),
          step('-0.5', -0.5),
          step('-0.1', -0.1),
          Expanded(
            child: Text(
              '${value >= 0 ? '+' : ''}${value.toStringAsFixed(1)}초',
              textAlign: TextAlign.center,
              style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
            ),
          ),
          step('+0.1', 0.1),
          step('+0.5', 0.5),
        ],
      ),
    );
  }

  Future<void> _pickSubtitle() async {
    try {
      final picked = await FilePicker.pickFile(type: FileType.any);
      final path = picked?.path;
      if (picked == null || path == null) return;
      final prepared = await prepareSubtitle(File(path));
      await _player.setSubtitleTrack(SubtitleTrack.uri(prepared, title: picked.name));
      _showHud(Icons.subtitles, '자막: ${picked.name}', hold: const Duration(seconds: 2));
    } catch (_) {
      _showHud(Icons.error_outline, '자막 파일을 읽지 못했습니다', hold: const Duration(seconds: 2));
    }
  }

  void _openSubtitleSheet() {
    final prefs = _prefs;
    if (prefs == null) return;
    _sheet<void>((context, setSheet) {
      final tracks = _player.state.tracks.subtitle
          .where((t) => t.id != 'auto')
          .toList();
      final current = _player.state.track.subtitle.id;
      var n = 0;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sheetTitle('자막'),
          for (final t in tracks)
            ListTile(
              leading: Icon(
                t.id == current ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              ),
              title: Text(t.id == 'no' ? '자막 끄기' : _trackLabel(t.title, t.language, ++n)),
              onTap: () async {
                await _player.setSubtitleTrack(t);
                setSheet(() {});
              },
            ),
          ListTile(
            leading: const Icon(Icons.folder_open),
            title: const Text('자막 파일 불러오기'),
            subtitle: const Text('SMI · SRT · ASS · SSA · VTT (한글 인코딩 자동 판별)'),
            onTap: () async {
              Navigator.of(context).pop();
              await _pickSubtitle();
            },
          ),
          const Divider(),
          _delayRow('싱크', _subDelay, (v) {
            _subDelay = v;
            _setProp('sub-delay', v.toStringAsFixed(1));
            setSheet(() {});
          }),
          ListTile(
            title: const Text('글자 크기'),
            subtitle: Slider(
              value: prefs.subtitleSize.clamp(16.0, 72.0),
              min: 16,
              max: 72,
              divisions: 28,
              label: prefs.subtitleSize.round().toString(),
              onChanged: (v) {
                prefs.subtitleSize = v;
                setSheet(() {});
                setState(() {});
              },
              onChangeEnd: (_) => prefs.save(),
            ),
          ),
          ListTile(
            title: const Text('위치(아래에서 높이)'),
            subtitle: Slider(
              value: prefs.subtitleBottom.clamp(0.0, 240.0),
              min: 0,
              max: 240,
              divisions: 24,
              onChanged: (v) {
                prefs.subtitleBottom = v;
                setSheet(() {});
                setState(() {});
              },
              onChangeEnd: (_) => prefs.save(),
            ),
          ),
          SwitchListTile(
            title: const Text('자막 배경 상자'),
            value: prefs.subtitleBackground,
            onChanged: (v) {
              prefs.subtitleBackground = v;
              prefs.save();
              setSheet(() {});
              setState(() {});
            },
          ),
        ],
      );
    });
  }

  void _openAudioSheet() {
    _sheet<void>((context, setSheet) {
      final tracks = _player.state.tracks.audio
          .where((t) => t.id != 'auto' && t.id != 'no')
          .toList();
      final current = _player.state.track.audio.id;
      var n = 0;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sheetTitle('오디오'),
          if (tracks.isEmpty)
            const ListTile(title: Text('오디오 트랙이 없습니다')),
          for (final t in tracks)
            ListTile(
              leading: Icon(
                t.id == current ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              ),
              title: Text(_trackLabel(t.title, t.language, ++n)),
              onTap: () async {
                await _player.setAudioTrack(t);
                setSheet(() {});
              },
            ),
          const Divider(),
          _delayRow('싱크', _audioDelay, (v) {
            _audioDelay = v;
            _setProp('audio-delay', v.toStringAsFixed(1));
            setSheet(() {});
          }),
          ListTile(
            title: Text('볼륨 ${_volume.round()}%'),
            subtitle: Slider(
              value: _volume,
              min: 0,
              max: 200,
              divisions: 40,
              onChanged: (v) {
                _volume = v;
                _player.setVolume(v);
                setSheet(() {});
              },
            ),
            trailing: const Text('100% 이상은 증폭'),
          ),
        ],
      );
    });
  }

  void _openSpeedSheet() {
    const presets = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0];
    _sheet<void>((context, setSheet) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sheetTitle('재생 속도 ${_rate.toStringAsFixed(2)}x'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final r in presets)
                  ChoiceChip(
                    label: Text('${r}x'),
                    selected: (_rate - r).abs() < 0.01,
                    onSelected: (_) async {
                      await _setRate(r);
                      setSheet(() {});
                    },
                  ),
              ],
            ),
          ),
          Slider(
            value: _rate,
            min: 0.25,
            max: 4,
            divisions: 75,
            label: '${_rate.toStringAsFixed(2)}x',
            onChanged: (v) async {
              await _setRate(v);
              setSheet(() {});
            },
          ),
          const SizedBox(height: 8),
        ],
      );
    });
  }

  void _openSettingsSheet() {
    final prefs = _prefs;
    if (prefs == null) return;
    _sheet<void>((context, setSheet) {
      void update(void Function() change) {
        change();
        prefs.save();
        setSheet(() {});
      }

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _sheetTitle('플레이어 설정'),
          SwitchListTile(
            title: const Text('하드웨어 가속'),
            subtitle: const Text('화면이 깨지거나 초록색으로 보이면 꺼 보세요'),
            value: prefs.hardwareDecoding,
            onChanged: (v) => update(() {
              prefs.hardwareDecoding = v;
              _setProp('hwdec', v ? 'auto-safe' : 'no');
            }),
          ),
          SwitchListTile(
            title: const Text('다음 영상 자동 재생'),
            value: prefs.autoNext,
            onChanged: (v) => update(() => prefs.autoNext = v),
          ),
          if (_pipSupported)
            SwitchListTile(
              title: const Text('홈으로 나가면 화면 속 화면으로 계속 보기'),
              value: prefs.autoPip,
              onChanged: (v) => update(() {
                prefs.autoPip = v;
                _updateAutoPip();
              }),
            ),
          SwitchListTile(
            title: const Text('영상 방향에 맞춰 자동 회전'),
            value: prefs.autoRotate,
            onChanged: (v) => update(() => prefs.autoRotate = v),
          ),
          ListTile(
            title: const Text('두 번 탭 건너뛰기'),
            trailing: DropdownButton<int>(
              value: prefs.doubleTapSeconds,
              items: [
                for (final s in const [5, 10, 15, 30])
                  DropdownMenuItem(value: s, child: Text('$s초')),
              ],
              onChanged: (v) => update(() => prefs.doubleTapSeconds = v ?? 10),
            ),
          ),
          ListTile(
            title: const Text('좌우로 밀기 감도'),
            subtitle: const Text('화면 폭 전체를 밀었을 때 이동하는 시간'),
            trailing: DropdownButton<int>(
              value: prefs.swipeSeekSeconds,
              items: [
                for (final s in const [30, 60, 90, 180, 300])
                  DropdownMenuItem(
                    value: s,
                    child: Text(s >= 60 ? '${s ~/ 60}분${s % 60 == 0 ? '' : ' ${s % 60}초'}' : '$s초'),
                  ),
              ],
              onChanged: (v) => update(() => prefs.swipeSeekSeconds = v ?? 90),
            ),
          ),
        ],
      );
    });
  }

  // ───────── 화면 ─────────

  static String _fmt(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    String two(int v) => v.toString().padLeft(2, '0');
    return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final prefs = _prefs;
    return PopScope(
      canPop: !_locked,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _locked) {
          _showHud(Icons.lock, '화면이 잠겨 있습니다. 잠금을 먼저 풀어 주세요.');
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: LayoutBuilder(
          builder: (context, box) {
            final width = box.maxWidth;
            final height = box.maxHeight;
            return Stack(
              fit: StackFit.expand,
              children: [
                if (controller != null && prefs != null)
                  Video(
                    controller: controller,
                    controls: NoVideoControls,
                    fit: _boxFit,
                    fill: Colors.black,
                    subtitleViewConfiguration: SubtitleViewConfiguration(
                      style: TextStyle(
                        fontSize: prefs.subtitleSize,
                        height: 1.35,
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        backgroundColor: prefs.subtitleBackground
                            ? const Color(0xAA000000)
                            : const Color(0x00000000),
                        shadows: const [
                          Shadow(blurRadius: 3, color: Colors.black),
                          Shadow(offset: Offset(1, 1), blurRadius: 2, color: Colors.black),
                        ],
                      ),
                      padding: EdgeInsets.fromLTRB(24, 0, 24, prefs.subtitleBottom),
                    ),
                  )
                else
                  const Center(child: CircularProgressIndicator()),
                if (_audioOnly) _buildAudioArt(),
                // 제스처 층
                if (!_pip)
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _toggleControls,
                    onDoubleTapDown: _locked ? null : (d) => _doubleTapAt = d.localPosition,
                    onDoubleTap: _locked ? null : () => _onDoubleTap(width),
                    onLongPressStart: _locked ? null : _onLongPressStart,
                    onLongPressEnd: _locked ? null : _onLongPressEnd,
                    onHorizontalDragStart: _locked ? null : _onHorizontalStart,
                    onHorizontalDragUpdate: _locked ? null : (d) => _onHorizontalUpdate(d, width),
                    onHorizontalDragEnd: _locked ? null : _onHorizontalEnd,
                    onVerticalDragStart: _locked ? null : (d) => _onVerticalStart(d, width),
                    onVerticalDragUpdate: _locked ? null : (d) => _onVerticalUpdate(d, height),
                    onVerticalDragEnd: _locked ? null : _onVerticalEnd,
                    child: const SizedBox.expand(),
                  ),
                ValueListenableBuilder<bool>(
                  valueListenable: _buffering,
                  builder: (context, buffering, _) => buffering
                      ? const Center(
                          child: CircularProgressIndicator(color: Colors.white70),
                        )
                      : const SizedBox.shrink(),
                ),
                if (_hudText != null) _buildHud(),
                if (!_pip && _locked && _controlsVisible) _buildLockButton(),
                if (!_pip && !_locked) _buildControls(context),
                if (!_pip && _resumedAt != null) _buildResumeBanner(),
                if (!_pip && _streamProgress != null) _buildStreamChip(),
                // 준비·오류 화면은 맨 위(제스처 층보다 위)에 둬야 버튼이 눌린다.
                if (_preparing) _buildPreparing(),
                if (_error != null && !_preparing) _buildError(),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildStreamChip() {
    final p = _streamProgress ?? 0;
    return Positioned(
      right: 16,
      top: MediaQuery.paddingOf(context).top + (_controlsVisible ? 64 : 12),
      child: IgnorePointer(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.55),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_download_outlined, color: Colors.white70, size: 16),
              const SizedBox(width: 6),
              Text(
                p < 0 ? '받으면서 재생 중' : '받으면서 재생 중 ${(p * 100).round()}%',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPreparing() {
    final total = _prepareTotal;
    final done = _prepareDone;
    String mb(int b) => (b / (1024 * 1024)).toStringAsFixed(b < 100 * 1024 * 1024 ? 1 : 0);
    final progress = total > 0 ? (done / total).clamp(0.0, 1.0) : null;
    return Positioned.fill(
      child: ColoredBox(
        color: Colors.black,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 220,
                  child: LinearProgressIndicator(value: progress),
                ),
                const SizedBox(height: 20),
                Text(
                  _current.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 16),
                ),
                const SizedBox(height: 10),
                Text(
                  done > 0
                      ? '내려받는 중 ${mb(done)}MB${total > 0 ? ' / ${mb(total)}MB' : ''}'
                      : '파일을 준비하는 중…\n구글 드라이브 같은 클라우드 파일은 영상을 먼저 받아야 해서\n시간이 걸릴 수 있습니다.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70, height: 1.5),
                ),
                const SizedBox(height: 20),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                  child: const Text('취소'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildError() {
    return Positioned.fill(
      child: ColoredBox(
        color: Colors.black,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, color: Colors.white70, size: 48),
                const SizedBox(height: 16),
                const Text(
                  '이 파일을 재생할 수 없습니다.',
                  style: TextStyle(color: Colors.white, fontSize: 17),
                ),
                const SizedBox(height: 8),
                Text(
                  _error ?? '',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white54),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    OutlinedButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                      child: const Text('닫기'),
                    ),
                    const SizedBox(width: 12),
                    FilledButton(
                      onPressed: () => _open(_index),
                      child: const Text('다시 시도'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAudioArt() {
    return IgnorePointer(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.music_note, size: 96, color: Colors.white54),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                _current.name,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontSize: 18),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHud() {
    return IgnorePointer(
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_hudIcon != null) Icon(_hudIcon, color: Colors.white, size: 32),
              const SizedBox(height: 6),
              Text(
                _hudText ?? '',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLockButton() {
    return Positioned(
      left: 24,
      top: 0,
      bottom: 0,
      child: Center(
        child: IconButton.filled(
          style: IconButton.styleFrom(backgroundColor: Colors.black54),
          onPressed: () {
            setState(() => _locked = false);
            _showHud(Icons.lock_open, '잠금 해제');
            _scheduleHide();
          },
          icon: const Icon(Icons.lock, color: Colors.white),
          tooltip: '잠금 해제',
        ),
      ),
    );
  }

  Widget _buildResumeBanner() {
    return Positioned(
      left: 16,
      bottom: _controlsVisible ? 128 : 24,
      child: Material(
        color: Colors.black.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.only(left: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '이어서 재생 ${_fmt(_resumedAt!)}',
                style: const TextStyle(color: Colors.white),
              ),
              TextButton(
                onPressed: () {
                  _player.seek(Duration.zero);
                  setState(() => _resumedAt = null);
                },
                child: const Text('처음부터'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _iconButton(IconData icon, String tooltip, VoidCallback? onPressed, {double size = 26}) {
    return IconButton(
      onPressed: onPressed == null
          ? null
          : () {
              onPressed();
              _scheduleHide();
            },
      icon: Icon(icon, size: size),
      color: Colors.white,
      disabledColor: Colors.white24,
      tooltip: tooltip,
    );
  }

  Widget _buildControls(BuildContext context) {
    final padding = MediaQuery.paddingOf(context);
    final hasPrev = _index > 0;
    final hasNext = _index < widget.playlist.length - 1;
    return IgnorePointer(
      ignoring: !_controlsVisible,
      child: AnimatedOpacity(
        opacity: _controlsVisible ? 1 : 0,
        duration: const Duration(milliseconds: 180),
        child: Stack(
          children: [
            // 위
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: EdgeInsets.only(
                  top: padding.top + 4,
                  left: padding.left + 4,
                  right: padding.right + 4,
                  bottom: 16,
                ),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xB3000000), Color(0x00000000)],
                  ),
                ),
                child: Row(
                  children: [
                    _iconButton(Icons.arrow_back, '뒤로', () => Navigator.of(context).maybePop()),
                    Expanded(
                      child: Text(
                        widget.playlist.length > 1
                            ? '${_current.name}  (${_index + 1}/${widget.playlist.length})'
                            : _current.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 16),
                      ),
                    ),
                    _iconButton(Icons.subtitles_outlined, '자막', _openSubtitleSheet),
                    _iconButton(Icons.audiotrack_outlined, '오디오', _openAudioSheet),
                    _iconButton(Icons.tune, '설정', _openSettingsSheet),
                  ],
                ),
              ),
            ),
            // 가운데
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _iconButton(Icons.skip_previous, '이전', hasPrev ? () => _open(_index - 1) : null, size: 34),
                  const SizedBox(width: 12),
                  _iconButton(Icons.replay_10, '뒤로 건너뛰기', () => _seekBy(-(_prefs?.doubleTapSeconds ?? 10)), size: 34),
                  const SizedBox(width: 12),
                  ValueListenableBuilder<bool>(
                    valueListenable: _playing,
                    builder: (context, playing, _) => IconButton.filled(
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.black45,
                        padding: const EdgeInsets.all(14),
                      ),
                      onPressed: () {
                        _player.playOrPause();
                        _scheduleHide();
                      },
                      icon: Icon(
                        playing ? Icons.pause : Icons.play_arrow,
                        size: 44,
                        color: Colors.white,
                      ),
                      tooltip: playing ? '일시정지' : '재생',
                    ),
                  ),
                  const SizedBox(width: 12),
                  _iconButton(Icons.forward_10, '앞으로 건너뛰기', () => _seekBy(_prefs?.doubleTapSeconds ?? 10), size: 34),
                  const SizedBox(width: 12),
                  _iconButton(Icons.skip_next, '다음', hasNext ? () => _open(_index + 1) : null, size: 34),
                ],
              ),
            ),
            // 아래
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: EdgeInsets.only(
                  left: padding.left + 12,
                  right: padding.right + 12,
                  bottom: padding.bottom + 4,
                  top: 24,
                ),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Color(0xB3000000), Color(0x00000000)],
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildSeekBar(),
                    Row(
                      children: [
                        _iconButton(Icons.lock_outline, '화면 잠금', () {
                          setState(() {
                            _locked = true;
                            _controlsVisible = false;
                          });
                          _showHud(Icons.lock, '화면 잠금 — 화면을 누르면 잠금 버튼이 나타납니다');
                        }),
                        TextButton(
                          onPressed: _openSpeedSheet,
                          child: Text(
                            '${_rate.toStringAsFixed(_rate == _rate.roundToDouble() ? 1 : 2)}x',
                            style: const TextStyle(color: Colors.white, fontSize: 15),
                          ),
                        ),
                        TextButton.icon(
                          onPressed: _cycleFit,
                          icon: const Icon(Icons.aspect_ratio, color: Colors.white, size: 20),
                          label: Text(_fit.label, style: const TextStyle(color: Colors.white)),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: _cycleAb,
                          child: Text(
                            _abA == null ? 'A-B' : (_abB == null ? 'A-?' : 'A-B ✓'),
                            style: TextStyle(
                              color: _abA == null ? Colors.white : Colors.amberAccent,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        _iconButton(
                          Icons.screen_rotation,
                          '화면 회전',
                          () => _setLandscape(!_landscape),
                        ),
                        if (_pipSupported && !_audioOnly)
                          _iconButton(Icons.picture_in_picture_alt, '화면 속 화면', _enterPip),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSeekBar() {
    return ValueListenableBuilder<Duration>(
      valueListenable: _duration,
      builder: (context, dur, _) => ValueListenableBuilder<Duration>(
        valueListenable: _position,
        builder: (context, pos, _) {
          final total = dur.inMilliseconds.toDouble();
          final value = (_sliderDrag ?? pos.inMilliseconds.toDouble()).clamp(0.0, total > 0 ? total : 1.0);
          const timeStyle = TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontFeatures: [FontFeature.tabularFigures()],
          );
          return Row(
            children: [
              Text(_fmt(Duration(milliseconds: value.round())), style: timeStyle),
              Expanded(
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                    overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
                    activeTrackColor: Colors.white,
                    inactiveTrackColor: Colors.white30,
                    thumbColor: Colors.white,
                  ),
                  child: Slider(
                    value: value,
                    max: total > 0 ? total : 1,
                    onChangeStart: (v) {
                      _hideTimer?.cancel();
                      setState(() => _sliderDrag = v);
                    },
                    onChanged: (v) => setState(() => _sliderDrag = v),
                    onChangeEnd: (v) {
                      _player.seek(Duration(milliseconds: v.round()));
                      setState(() => _sliderDrag = null);
                      _scheduleHide();
                    },
                  ),
                ),
              ),
              Text(_fmt(dur), style: timeStyle),
            ],
          );
        },
      ),
    );
  }
}
