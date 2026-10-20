import 'dart:ui';

/// 배경색·글자색 조합.
class ReaderTheme {
  const ReaderTheme(this.name, this.background, this.text);

  final String name;
  final int background;
  final int text;
}

const readerThemes = <ReaderTheme>[
  ReaderTheme('흰색', 0xFFFFFFFF, 0xFF1B1F24),
  ReaderTheme('세피아', 0xFFF4ECD8, 0xFF5B4636),
  ReaderTheme('회색', 0xFFE4E4E4, 0xFF222222),
  ReaderTheme('연두', 0xFFCCE8CF, 0xFF2B3A2D),
  ReaderTheme('다크', 0xFF1E1E1E, 0xFFD4D4D4),
  ReaderTheme('검정', 0xFF000000, 0xFFB8B8B8),
];

/// 팔레트에서 고를 수 있는 색.
const readerPalette = <int>[
  0xFFFFFFFF,
  0xFFF4ECD8,
  0xFFE4E4E4,
  0xFFCCE8CF,
  0xFFD6E4F0,
  0xFFF0D9D9,
  0xFF3A3A3A,
  0xFF1E1E1E,
  0xFF000000,
  0xFF5B4636,
  0xFF2B3A2D,
  0xFF1B3A5C,
  0xFFB8B8B8,
  0xFFD4D4D4,
  0xFF8A8A8A,
  0xFFE8D9B5,
  0xFFFFC857,
  0xFF9AD1A0,
];

/// 글꼴 선택지. 기기에 내장된 글꼴을 쓰므로 앱 크기가 늘지 않는다.
const readerFonts = <String, String?>{
  '고딕': null,
  '명조': 'serif',
  '고정폭': 'monospace',
  '필기체': 'cursive',
};

class ReaderSettings {
  const ReaderSettings({
    this.fontSize = 18,
    this.lineHeight = 1.7,
    this.letterSpacing = 0,
    this.paragraphGap = 0.5,
    this.horizontalPadding = 20,
    this.font = '고딕',
    this.background = 0xFFFFFFFF,
    this.text = 0xFF1B1F24,
    this.blueLight = 0,
    this.dim = 0,
    this.joinLines = false,
    this.tapPaging = true,
    this.pageRatio = 0.9,
    this.holdSpeed = 1.5,
    this.keepScreenOn = true,
  });

  final double fontSize;
  final double lineHeight;
  final double letterSpacing;

  /// 문단 사이 간격(글자 크기 × 줄 간격 기준 몇 줄만큼).
  final double paragraphGap;
  final double horizontalPadding;
  final String font;
  final int background;
  final int text;

  /// 0~1. 화면을 따뜻한 색으로 만들어 파란빛을 줄인다.
  final double blueLight;

  /// 0~1. 화면을 어둡게 덮는 정도.
  final double dim;

  /// 줄 끝에서 꺾인 줄을 이어 붙인다.
  final bool joinLines;

  /// 화면 위/아래를 눌러 넘긴다.
  final bool tapPaging;

  /// 한 번 넘길 때 화면 높이의 몇 배만큼 이동할지.
  final double pageRatio;

  /// 길게 누르고 있을 때 1초에 넘어가는 화면 수.
  final double holdSpeed;

  /// 읽는 동안 화면이 꺼지지 않게 한다.
  final bool keepScreenOn;

  String? get fontFamily => readerFonts[font];

  /// 글자 배치(= 문단 높이)에 영향을 주는 값이 같은지. 다르면 높이를 다시 재야 한다.
  bool sameLayoutAs(ReaderSettings o) =>
      fontSize == o.fontSize &&
      lineHeight == o.lineHeight &&
      letterSpacing == o.letterSpacing &&
      paragraphGap == o.paragraphGap &&
      horizontalPadding == o.horizontalPadding &&
      font == o.font &&
      joinLines == o.joinLines;

  ReaderSettings copyWith({
    double? fontSize,
    double? lineHeight,
    double? letterSpacing,
    double? paragraphGap,
    double? horizontalPadding,
    String? font,
    int? background,
    int? text,
    double? blueLight,
    double? dim,
    bool? joinLines,
    bool? tapPaging,
    double? pageRatio,
    double? holdSpeed,
    bool? keepScreenOn,
  }) => ReaderSettings(
    fontSize: fontSize ?? this.fontSize,
    lineHeight: lineHeight ?? this.lineHeight,
    letterSpacing: letterSpacing ?? this.letterSpacing,
    paragraphGap: paragraphGap ?? this.paragraphGap,
    horizontalPadding: horizontalPadding ?? this.horizontalPadding,
    font: font ?? this.font,
    background: background ?? this.background,
    text: text ?? this.text,
    blueLight: blueLight ?? this.blueLight,
    dim: dim ?? this.dim,
    joinLines: joinLines ?? this.joinLines,
    tapPaging: tapPaging ?? this.tapPaging,
    pageRatio: pageRatio ?? this.pageRatio,
    holdSpeed: holdSpeed ?? this.holdSpeed,
    keepScreenOn: keepScreenOn ?? this.keepScreenOn,
  );

  Map<String, Object> toJson() => {
    'fontSize': fontSize,
    'lineHeight': lineHeight,
    'letterSpacing': letterSpacing,
    'paragraphGap': paragraphGap,
    'horizontalPadding': horizontalPadding,
    'font': font,
    'background': background,
    'text': text,
    'blueLight': blueLight,
    'dim': dim,
    'joinLines': joinLines,
    'tapPaging': tapPaging,
    'pageRatio': pageRatio,
    'holdSpeed': holdSpeed,
    'keepScreenOn': keepScreenOn,
  };

  /// 저장된 값이 일부 없거나 범위를 벗어나도 안전하게 읽는다.
  factory ReaderSettings.fromJson(Map<String, dynamic> json) {
    const d = ReaderSettings();
    double number(String key, double fallback, double min, double max) {
      final v = json[key];
      return v is num ? v.toDouble().clamp(min, max) : fallback;
    }

    int color(String key, int fallback) =>
        json[key] is int ? json[key] as int : fallback;
    bool flag(String key, bool fallback) =>
        json[key] is bool ? json[key] as bool : fallback;
    final font = json['font'];
    return ReaderSettings(
      fontSize: number('fontSize', d.fontSize, 10, 60),
      lineHeight: number('lineHeight', d.lineHeight, 1.0, 3.0),
      letterSpacing: number('letterSpacing', d.letterSpacing, -2, 8),
      paragraphGap: number('paragraphGap', d.paragraphGap, 0, 2),
      horizontalPadding: number(
        'horizontalPadding',
        d.horizontalPadding,
        0,
        64,
      ),
      font: font is String && readerFonts.containsKey(font) ? font : d.font,
      background: color('background', d.background),
      text: color('text', d.text),
      blueLight: number('blueLight', d.blueLight, 0, 1),
      dim: number('dim', d.dim, 0, 0.8),
      joinLines: flag('joinLines', d.joinLines),
      tapPaging: flag('tapPaging', d.tapPaging),
      pageRatio: number('pageRatio', d.pageRatio, 0.2, 1.0),
      holdSpeed: number('holdSpeed', d.holdSpeed, 0.3, 6),
      keepScreenOn: flag('keepScreenOn', d.keepScreenOn),
    );
  }

  /// 배경이 밝은지(상태 표시줄 아이콘 색 결정용).
  bool get isLightBackground => Color(background).computeLuminance() > 0.5;
}
