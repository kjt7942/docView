import 'package:flutter/material.dart';

import '../document.dart';

/// 아직 렌더러가 없는 포맷을 열었을 때 보여주는 화면.
///
/// 조용히 실패하지 않고, 무엇이 지원되고 무엇이 준비 중인지 분명히 알린다.
class UnsupportedFormatScreen extends StatelessWidget {
  const UnsupportedFormatScreen({super.key, required this.document});

  final DocumentFile document;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final format = document.format;
    final extension = document.extension.isEmpty
        ? '이'
        : document.extension.toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Text(document.name, overflow: TextOverflow.ellipsis),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: format.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Icon(format.icon, size: 34, color: format.color),
                ),
                const SizedBox(height: 20),
                Text(
                  '$extension 형식은 아직 지원하지 않습니다',
                  style: theme.textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'PDF, DOCX, XLSX, PPTX, HWP 5.0, TXT, 이미지 파일을 열 수 있습니다.\n'
                  '다른 이름으로 저장에서 PDF나 DOCX로 변환하면 바로 볼 수 있습니다.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.arrow_back),
                  label: const Text('돌아가기'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
