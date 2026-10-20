import 'package:flutter/material.dart';

import '../document.dart';
import '../reader/text_reader_screen.dart';
import 'pdf_viewer_screen.dart';
import 'unsupported_format_screen.dart';
import 'web_document_screen.dart';

/// 확장자를 보고 알맞은 렌더러로 보낸다.
///
/// 새 포맷을 지원할 때는 렌더러 위젯을 만들고 이 switch에만 추가하면 된다.
class DocumentViewerScreen extends StatelessWidget {
  const DocumentViewerScreen({
    super.key,
    required this.document,
    this.initialQuery,
  });

  final DocumentFile document;

  /// 검색에서 들어왔다면 열자마자 찾을 단어(TXT 리더가 사용한다).
  final String? initialQuery;

  @override
  Widget build(BuildContext context) {
    return switch (document.format) {
      DocumentFormat.pdf => PdfViewerScreen(document: document),
      DocumentFormat.text when document.extension != 'md' => TextReaderScreen(
        document: document,
        initialQuery: initialQuery,
      ),
      _ when document.webKind != null => WebDocumentScreen(document: document),
      _ => UnsupportedFormatScreen(document: document),
    };
  }
}
