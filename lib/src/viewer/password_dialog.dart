import 'package:flutter/material.dart';

/// 암호로 보호된 문서의 비밀번호를 묻는다. 취소하면 null.
///
/// [retry]가 true면 직전 입력이 틀렸다는 안내를 함께 보여준다.
Future<String?> showPasswordDialog(
  BuildContext context, {
  required String fileName,
  bool retry = false,
}) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _PasswordDialog(fileName: fileName, retry: retry),
  );
}

class _PasswordDialog extends StatefulWidget {
  const _PasswordDialog({required this.fileName, required this.retry});

  final String fileName;
  final bool retry;

  @override
  State<_PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends State<_PasswordDialog> {
  final _controller = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    if (_controller.text.isEmpty) return;
    Navigator.of(context).pop(_controller.text);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('비밀번호 입력'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.fileName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            autofocus: true,
            obscureText: _obscure,
            enableSuggestions: false,
            autocorrect: false,
            onSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: '비밀번호',
              errorText: widget.retry ? '비밀번호가 맞지 않습니다.' : null,
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                tooltip: _obscure ? '비밀번호 보기' : '비밀번호 숨기기',
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('취소'),
        ),
        FilledButton(onPressed: _submit, child: const Text('확인')),
      ],
    );
  }
}
