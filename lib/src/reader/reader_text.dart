/// 검색 결과 하나. [paragraph]번째 문단 안의 [start, end) 구간.
class SearchHit {
  const SearchHit(this.paragraph, this.start, this.end);

  final int paragraph;
  final int start;
  final int end;
}

/// 리더가 화면에 그리는 문단 목록.
///
/// [starts]는 각 문단이 시작하는 **원문 기준 글자 위치**다. 책갈피와 읽던 위치는 이 값으로 저장하므로
/// 개행 제거 옵션을 바꾸거나 글자 크기를 바꿔도 같은 자리로 돌아올 수 있다.
class ReaderText {
  const ReaderText(this.paragraphs, this.starts);

  final List<String> paragraphs;
  final List<int> starts;

  int get length => paragraphs.length;

  /// 원문 위치 [offset]이 속한 문단 번호.
  int paragraphIndexAt(int offset) {
    var lo = 0;
    var hi = starts.length - 1;
    while (lo < hi) {
      final mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /// [raw]를 문단으로 나눈다.
  ///
  /// [joinLines]가 true면 줄 끝에서 억지로 꺾인 줄(하드 랩)을 이어 붙인다.
  /// 줄이 문장 부호로 끝나거나 다음 줄이 들여쓰기로 시작하면 새 문단으로 본다.
  /// 빈 줄은 문단 구분으로만 쓰고 그대로 그리지 않는다(문단 간격 설정이 대신한다).
  factory ReaderText.build(String raw, {required bool joinLines}) {
    final text = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    final paragraphs = <String>[];
    final starts = <int>[];

    StringBuffer? current;
    var currentStart = 0;
    var previous = '';

    void flush() {
      final buffer = current;
      if (buffer != null) {
        paragraphs.add(buffer.toString());
        starts.add(currentStart);
        current = null;
      }
    }

    var pos = 0;
    while (pos <= text.length) {
      var end = text.indexOf('\n', pos);
      if (end < 0) end = text.length;
      final line = text.substring(pos, end).replaceAll('\t', '    ');
      final lineStart = pos;
      pos = end + 1;

      if (!joinLines) {
        paragraphs.add(line);
        starts.add(lineStart);
        continue;
      }

      if (line.trim().isEmpty) {
        flush();
        continue;
      }
      final buffer = current;
      if (buffer == null || _startsParagraph(previous, line)) {
        flush();
        current = StringBuffer(_trimRight(line));
        currentStart = lineStart;
      } else {
        final next = line.trim();
        if (_needsSpace(buffer.toString(), next)) buffer.write(' ');
        buffer.write(next);
      }
      previous = line;
    }
    flush();

    if (paragraphs.isEmpty) {
      paragraphs.add('');
      starts.add(0);
    }
    return ReaderText(paragraphs, starts);
  }

  /// 대소문자를 구분하지 않고 [query]를 찾는다. 결과는 최대 [limit]개.
  List<SearchHit> search(String query, {int limit = 5000}) {
    final q = query.toLowerCase();
    if (q.isEmpty) return const [];
    final hits = <SearchHit>[];
    for (var i = 0; i < paragraphs.length; i++) {
      final lower = paragraphs[i].toLowerCase();
      var from = 0;
      while (true) {
        final at = lower.indexOf(q, from);
        if (at < 0) break;
        hits.add(SearchHit(i, at, at + q.length));
        if (hits.length >= limit) return hits;
        from = at + q.length;
      }
    }
    return hits;
  }
}

const _terminators = '.?!…。！？」』"”’)]';

bool _startsParagraph(String previousLine, String line) {
  if (line.startsWith('　') || line.startsWith('  ') || line.startsWith('\t')) {
    return true;
  }
  final end = previousLine.trimRight();
  return end.isNotEmpty && _terminators.contains(end[end.length - 1]);
}

String _trimRight(String s) => s.replaceFirst(RegExp(r'\s+$'), '');

/// 한자·가나는 띄어쓰기를 쓰지 않으므로 이어 붙일 때 공백을 넣지 않는다.
bool _needsSpace(String left, String right) {
  if (left.isEmpty || right.isEmpty) return false;
  return !(_isNoSpaceScript(left.codeUnitAt(left.length - 1)) &&
      _isNoSpaceScript(right.codeUnitAt(0)));
}

bool _isNoSpaceScript(int c) =>
    (c >= 0x3040 && c <= 0x30FF) ||
    (c >= 0x3400 && c <= 0x4DBF) ||
    (c >= 0x4E00 && c <= 0x9FFF);
