import 'dart:io';

import 'document.dart';
import 'reader/text_decoder.dart';

/// 최근 문서 검색 결과 하나.
class SearchResult {
  const SearchResult(this.document, {this.snippet});

  final DocumentFile document;

  /// 본문에서 찾은 경우 단어 주변 문장. 파일명만 일치하면 null.
  final String? snippet;
}

/// 본문을 읽어 검색할 수 있는 형식(텍스트 계열). 나머지 형식은 파일명만 검색한다.
bool canSearchBody(DocumentFile document) =>
    const {'txt', 'log', 'md', 'csv'}.contains(document.extension);

/// 단어 앞 [before]자, 뒤 [after]자를 잘라 한 줄 미리보기로 만든다.
String snippetAround(
  String text,
  int at,
  int length, {
  int before = 24,
  int after = 56,
}) {
  final start = (at - before).clamp(0, text.length);
  final end = (at + length + after).clamp(0, text.length);
  final body = text
      .substring(start, end)
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return '${start > 0 ? '…' : ''}$body${end < text.length ? '…' : ''}';
}

/// [documents] 중에서 [query]가 파일명에 있거나(옵션이 켜져 있으면) 본문에 있는 문서를 찾는다.
///
/// 파일명이 일치한 문서가 먼저 나온다. [isCancelled]가 true를 돌려주면 중간에 그만둔다.
Future<List<SearchResult>> searchDocuments(
  List<DocumentFile> documents,
  String query, {
  required bool includeBody,
  bool Function()? isCancelled,
}) async {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return const [];
  final byName = <SearchResult>[];
  final byBody = <SearchResult>[];
  for (final document in documents) {
    if (isCancelled?.call() ?? false) return const [];
    if (document.name.toLowerCase().contains(q)) {
      byName.add(SearchResult(document));
      continue;
    }
    if (!includeBody || !canSearchBody(document)) continue;
    try {
      final text = await readTextFile(File(document.path));
      final at = text.toLowerCase().indexOf(q);
      if (at >= 0) {
        byBody.add(
          SearchResult(document, snippet: snippetAround(text, at, q.length)),
        );
      }
    } catch (_) {
      // 읽을 수 없는 파일(삭제됨 등)은 건너뛴다.
    }
  }
  return [...byName, ...byBody];
}
