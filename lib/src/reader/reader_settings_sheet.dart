import 'package:flutter/material.dart';

import 'reader_settings.dart';

/// 리더 보기 설정 시트.
///
/// 색·눈 보호·넘김 설정은 바로 반영하고, 글자 배치(크기·간격·글꼴·개행 제거)는
/// 슬라이더에서 손을 뗄 때 한 번만 반영한다(반영할 때마다 문단 높이를 다시 재야 하므로).
class ReaderSettingsSheet extends StatefulWidget {
  const ReaderSettingsSheet({
    super.key,
    required this.settings,
    required this.onChanged,
  });

  final ReaderSettings settings;
  final void Function(ReaderSettings next, {required bool relayout}) onChanged;

  @override
  State<ReaderSettingsSheet> createState() => _ReaderSettingsSheetState();
}

class _ReaderSettingsSheetState extends State<ReaderSettingsSheet> {
  late ReaderSettings _s = widget.settings;

  /// 즉시 반영하는 값.
  void _apply(ReaderSettings next) {
    setState(() => _s = next);
    widget.onChanged(next, relayout: false);
  }

  /// 글자 배치에 영향을 주는 값. 화면 미리보기만 바꾸고, 확정은 [_commit]에서 한다.
  void _preview(ReaderSettings next) => setState(() => _s = next);

  void _commit() => widget.onChanged(_s, relayout: true);

  void _applyLayout(ReaderSettings next) {
    setState(() => _s = next);
    widget.onChanged(next, relayout: true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottom = MediaQuery.of(context).padding.bottom;
    // 눈금 점이 너무 촘촘해 보여서 숨긴다.
    return SliderTheme(
      data: SliderTheme.of(context)
          .copyWith(tickMarkShape: SliderTickMarkShape.noTickMark),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.78,
        ),
        child: ListView(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 24 + bottom),
          shrinkWrap: true,
          children: [
            _preview_(),
            _title('글꼴'),
            Wrap(
              spacing: 8,
              children: [
                for (final font in readerFonts.keys)
                  ChoiceChip(
                    label: Text(font),
                    selected: _s.font == font,
                    onSelected: (_) => _applyLayout(_s.copyWith(font: font)),
                  ),
              ],
            ),
            _slider(
              '글자 크기',
              '${_s.fontSize.round()}',
              _s.fontSize,
              12,
              40,
              28,
              (v) => _preview(_s.copyWith(fontSize: v)),
              layout: true,
            ),
            _slider(
              '줄 간격',
              _s.lineHeight.toStringAsFixed(1),
              _s.lineHeight,
              1.0,
              3.0,
              20,
              (v) => _preview(_s.copyWith(lineHeight: v)),
              layout: true,
            ),
            _slider(
              '자간',
              _s.letterSpacing.toStringAsFixed(1),
              _s.letterSpacing,
              -1,
              4,
              50,
              (v) => _preview(_s.copyWith(letterSpacing: v)),
              layout: true,
            ),
            _slider(
              '문단 간격',
              _s.paragraphGap.toStringAsFixed(1),
              _s.paragraphGap,
              0,
              1.5,
              15,
              (v) => _preview(_s.copyWith(paragraphGap: v)),
              layout: true,
            ),
            _slider(
              '좌우 여백',
              '${_s.horizontalPadding.round()}',
              _s.horizontalPadding,
              0,
              48,
              24,
              (v) => _preview(_s.copyWith(horizontalPadding: v)),
              layout: true,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('개행 문자 제거'),
              subtitle: const Text('줄 끝에서 억지로 끊긴 줄을 이어 붙여 화면 폭에 맞게 보여줍니다.'),
              value: _s.joinLines,
              onChanged: (v) => _applyLayout(_s.copyWith(joinLines: v)),
            ),
            _title('색상'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final t in readerThemes)
                  ActionChip(
                    avatar: CircleAvatar(
                      backgroundColor: Color(t.background),
                      child: Text(
                        '가',
                        style: TextStyle(color: Color(t.text), fontSize: 12),
                      ),
                    ),
                    label: Text(t.name),
                    onPressed: () => _apply(
                      _s.copyWith(background: t.background, text: t.text),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text('배경색', style: theme.textTheme.labelLarge),
            const SizedBox(height: 6),
            _palette(_s.background, (c) => _apply(_s.copyWith(background: c))),
            const SizedBox(height: 12),
            Text('글자색', style: theme.textTheme.labelLarge),
            const SizedBox(height: 6),
            _palette(_s.text, (c) => _apply(_s.copyWith(text: c))),
            _title('눈 보호'),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.nightlight_outlined),
                label: const Text('독서 모드 (세피아 + 블루라이트 줄이기)'),
                onPressed: () => _apply(
                  _s.copyWith(
                    background: 0xFFF4ECD8,
                    text: 0xFF5B4636,
                    blueLight: 0.35,
                  ),
                ),
              ),
            ),
            _slider(
              '블루라이트 줄이기',
              '${(_s.blueLight * 100).round()}%',
              _s.blueLight,
              0,
              0.8,
              16,
              (v) => _apply(_s.copyWith(blueLight: v)),
            ),
            _slider(
              '화면 어둡게',
              '${(_s.dim * 100).round()}%',
              _s.dim,
              0,
              0.7,
              14,
              (v) => _apply(_s.copyWith(dim: v)),
            ),
            _title('넘김'),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('화면 위/아래를 눌러 넘기기'),
              subtitle: const Text(
                '아래쪽을 살짝 누르면 다음 화면, 길게 누르면 스크롤하듯 계속 넘어갑니다. 위쪽은 반대 방향입니다.',
              ),
              value: _s.tapPaging,
              onChanged: (v) => _apply(_s.copyWith(tapPaging: v)),
            ),
            _slider(
              '한 번에 넘기는 거리',
              '화면의 ${(_s.pageRatio * 100).round()}%',
              _s.pageRatio,
              0.3,
              1.0,
              14,
              (v) => _apply(_s.copyWith(pageRatio: v)),
            ),
            _slider(
              '길게 누를 때 속도',
              '초당 ${_s.holdSpeed.toStringAsFixed(1)}화면',
              _s.holdSpeed,
              0.5,
              5,
              18,
              (v) => _apply(_s.copyWith(holdSpeed: v)),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                icon: const Icon(Icons.restart_alt),
                label: const Text('기본값으로 되돌리기'),
                onPressed: () => _applyLayout(const ReaderSettings()),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _title(String text) => Padding(
    padding: const EdgeInsets.only(top: 20, bottom: 8),
    child: Text(
      text,
      style: Theme.of(context).textTheme.titleSmall
          ?.copyWith(fontWeight: FontWeight.w700),
    ),
  );

  /// 지금 설정으로 글자가 어떻게 보일지 미리 보여준다.
  Widget _preview_() => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 4),
    padding: EdgeInsets.symmetric(
      horizontal: _s.horizontalPadding.clamp(8, 24).toDouble(),
      vertical: 14,
    ),
    decoration: BoxDecoration(
      color: Color(_s.background),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Text(
      '가을 하늘이 높고 맑다.\nThe quick brown fox 0123456789',
      style: TextStyle(
        inherit: false,
        color: Color(_s.text),
        fontSize: _s.fontSize,
        height: _s.lineHeight,
        letterSpacing: _s.letterSpacing,
        fontFamily: _s.fontFamily,
      ),
    ),
  );

  Widget _slider(
    String label,
    String value,
    double current,
    double min,
    double max,
    int divisions,
    ValueChanged<double> onChanged, {
    bool layout = false,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(
          children: [
            Text(label),
            const Spacer(),
            Text(value, style: Theme.of(context).textTheme.labelMedium),
          ],
        ),
      ),
      Slider(
        value: current.clamp(min, max),
        min: min,
        max: max,
        divisions: divisions,
        onChanged: onChanged,
        onChangeEnd: layout ? (_) => _commit() : null,
      ),
    ],
  );

  Widget _palette(int selected, ValueChanged<int> onPick) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final c in readerPalette)
        GestureDetector(
          onTap: () => onPick(c),
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Color(c),
              shape: BoxShape.circle,
              border: Border.all(
                color: c == selected
                    ? Theme.of(context).colorScheme.primary
                    : Colors.grey.shade400,
                width: c == selected ? 3 : 1,
              ),
            ),
          ),
        ),
    ],
  );
}
