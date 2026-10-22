import 'package:flutter/material.dart';

import '../document.dart';
import '../media/image_viewer_screen.dart';
import '../media/video_player_screen.dart';
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
    this.siblings = const [],
  });

  final DocumentFile document;

  /// 검색에서 들어왔다면 열자마자 찾을 단어(TXT 리더가 사용한다).
  final String? initialQuery;

  /// 함께 넘겨 볼 수 있는 파일들(최근 목록). 사진은 좌우로 넘기고, 동영상은 이전/다음으로 이어 본다.
  final List<DocumentFile> siblings;

  /// [document]와 같은 종류의 파일 목록과 그 안에서 [document]의 위치.
  (List<DocumentFile>, int) _group(bool Function(DocumentFile) same) {
    final list = [
      for (final d in siblings)
        if (same(d)) d,
    ];
    var index = list.indexWhere(
      (d) => d.path == document.path ||
          (d.name == document.name && d.size == document.size),
    );
    if (index < 0) {
      list.insert(0, document);
      index = 0;
    }
    return (list, index);
  }

  @override
  Widget build(BuildContext context) {
    final format = document.format;
    if (format == DocumentFormat.image) {
      final (images, index) = _group((d) => d.format == DocumentFormat.image);
      return ImageViewerScreen(images: images, initialIndex: index);
    }
    if (document.isMedia) {
      final (list, index) = _group((d) => d.format == format);
      return VideoPlayerScreen(playlist: list, initialIndex: index);
    }
    return switch (format) {
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
