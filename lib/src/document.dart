import 'package:flutter/material.dart';

/// 문서 포맷. 뷰어가 어떤 렌더러로 보낼지 결정하는 단위다.
///
/// [supported]가 false인 포맷은 아직 렌더러가 붙지 않은 상태이며,
/// 사용자에게 "지원 예정"으로 안내한다.
enum DocumentFormat {
  pdf(
    label: 'PDF',
    extensions: ['pdf'],
    icon: Icons.picture_as_pdf_outlined,
    color: Color(0xFFD64545),
    supported: true,
  ),
  word(
    label: 'Word',
    extensions: ['doc', 'docx'],
    icon: Icons.article_outlined,
    color: Color(0xFF2B579A),
    supported: true,
  ),
  excel(
    label: 'Excel',
    extensions: ['xls', 'xlsx', 'csv'],
    icon: Icons.table_chart_outlined,
    color: Color(0xFF217346),
    supported: true,
  ),
  powerpoint(
    label: 'PowerPoint',
    extensions: ['ppt', 'pptx'],
    icon: Icons.slideshow_outlined,
    color: Color(0xFFB7472A),
    supported: true,
  ),
  hwp(
    label: '한글',
    extensions: ['hwp', 'hwpx'],
    icon: Icons.menu_book_outlined,
    color: Color(0xFF3E7DB8),
    supported: true,
  ),
  text(
    label: '텍스트',
    extensions: ['txt', 'md', 'log'],
    icon: Icons.notes_outlined,
    color: Color(0xFF5C6B7A),
    supported: true,
  ),
  image(
    label: '이미지',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'],
    icon: Icons.image_outlined,
    color: Color(0xFF7A5AF8),
    supported: true,
  ),
  unknown(
    label: '기타',
    extensions: [],
    icon: Icons.insert_drive_file_outlined,
    color: Color(0xFF6B7280),
    supported: false,
  );

  const DocumentFormat({
    required this.label,
    required this.extensions,
    required this.icon,
    required this.color,
    required this.supported,
  });

  final String label;
  final List<String> extensions;
  final IconData icon;
  final Color color;
  final bool supported;

  /// 파일 이름의 확장자로 포맷을 판별한다. 확장자가 없으면 [unknown].
  static DocumentFormat fromFileName(String fileName) {
    final ext = _extensionOf(fileName);
    if (ext.isEmpty) return DocumentFormat.unknown;
    for (final format in DocumentFormat.values) {
      if (format.extensions.contains(ext)) return format;
    }
    return DocumentFormat.unknown;
  }

  static String _extensionOf(String fileName) {
    final dot = fileName.lastIndexOf('.');
    if (dot < 0 || dot == fileName.length - 1) return '';
    return fileName.substring(dot + 1).toLowerCase();
  }

  /// 파일 선택 다이얼로그에 넘길 확장자 목록.
  static List<String> get allExtensions => [
    for (final format in DocumentFormat.values) ...format.extensions,
  ];
}

/// 기기에서 열기로 선택된 문서 하나.
@immutable
class DocumentFile {
  const DocumentFile({
    required this.path,
    required this.name,
    required this.size,
  });

  final String path;
  final String name;
  final int size;

  DocumentFormat get format => DocumentFormat.fromFileName(name);

  /// 소문자 확장자. 예: `PDF`
  String get extension => DocumentFormat._extensionOf(name);

  /// WebView 렌더러가 처리할 수 있는 형식이면 렌더러 종류를 돌려준다.
  ///
  /// 레거시 바이너리 형식(.doc/.ppt)과 HWPX는 아직 렌더러가 없다.
  String? get webKind => switch (extension) {
    'docx' => 'docx',
    'xlsx' || 'xls' || 'csv' => 'xlsx',
    'pptx' => 'pptx',
    'hwp' => 'hwp',
    'md' => 'markdown',
    'txt' || 'log' => 'text',
    'jpg' || 'jpeg' || 'png' || 'gif' || 'webp' || 'bmp' => 'image',
    _ => null,
  };

  String get readableSize {
    if (size < 1024) return '$size B';
    if (size < 1024 * 1024) return '${(size / 1024).toStringAsFixed(0)} KB';
    return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
