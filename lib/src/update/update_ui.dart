import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import 'apk_installer.dart';
import 'update_service.dart';

/// 업데이트 확인부터 설치까지의 사용자 흐름.
///
/// [manual]이 false면(앱 시작 시 자동 확인) 조용히 실패하고,
/// 최신 버전일 때도 아무것도 띄우지 않는다.
Future<void> checkForUpdates(
  BuildContext context, {
  bool manual = false,
}) async {
  if (!AppConfig.hasReleaseChannel) {
    if (manual) {
      _snack(context, '이 빌드는 업데이트 채널이 설정되지 않았습니다.');
    }
    return;
  }

  final service = UpdateService();
  try {
    final release = await service.checkForUpdate();
    if (!context.mounted) return;

    if (release == null) {
      if (manual) _snack(context, '최신 버전을 사용 중입니다.');
      return;
    }

    final shouldUpdate = await _showReleaseDialog(context, release);
    if (shouldUpdate != true || !context.mounted) return;

    if (!Platform.isAndroid) {
      // iOS는 정책상 인앱 설치가 불가능하므로 스토어/릴리스 페이지로 보낸다.
      await launchUrl(
        Uri.parse(release.pageUrl),
        mode: LaunchMode.externalApplication,
      );
      return;
    }

    if (!await ApkInstaller.canInstall()) {
      if (!context.mounted) return;
      await _showInstallPermissionDialog(context);
      return;
    }

    if (!context.mounted) return;
    await _downloadAndInstall(context, service, release);
  } catch (_) {
    if (manual && context.mounted) {
      _snack(context, '업데이트를 확인하지 못했습니다. 네트워크를 확인해 주세요.');
    }
  } finally {
    service.dispose();
  }
}

Future<bool?> _showReleaseDialog(BuildContext context, AppRelease release) {
  final theme = Theme.of(context);
  return showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text('새 버전 ${release.version}'),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                Platform.isAndroid
                    ? '지금 업데이트하면 앱 안에서 바로 설치할 수 있습니다.'
                    : '최신 버전은 스토어에서 설치할 수 있습니다.',
                style: theme.textTheme.bodyMedium,
              ),
              if (release.notes.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  release.notes,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                  maxLines: 12,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('나중에'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: const Text('업데이트'),
        ),
      ],
    ),
  );
}

Future<void> _showInstallPermissionDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('설치 권한이 필요합니다'),
      content: const Text(
        '앱 안에서 업데이트를 설치하려면 "알 수 없는 앱 설치"를 '
        '이 앱에 대해 허용해야 합니다.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: const Text('취소'),
        ),
        FilledButton(
          onPressed: () {
            Navigator.of(dialogContext).pop();
            ApkInstaller.openInstallSettings();
          },
          child: const Text('설정 열기'),
        ),
      ],
    ),
  );
}

Future<void> _downloadAndInstall(
  BuildContext context,
  UpdateService service,
  AppRelease release,
) async {
  final apkUrl = release.apkUrl;
  if (apkUrl == null) {
    _snack(context, '릴리스에 APK 파일이 없습니다.');
    return;
  }

  final navigator = Navigator.of(context, rootNavigator: true);
  final progress = ValueNotifier<double>(0);
  unawaited(
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _DownloadDialog(progress: progress),
    ),
  );

  try {
    final file = await service.downloadApk(
      apkUrl,
      onProgress: (value) => progress.value = value.clamp(0, 1),
    );
    if (navigator.canPop()) navigator.pop();
    await ApkInstaller.install(file.path);
    if (context.mounted) {
      _snack(context, '설치 화면에서 "설치"를 눌러 업데이트를 마무리하세요.');
    }
  } catch (_) {
    if (navigator.canPop()) navigator.pop();
    if (context.mounted) {
      _snack(context, '업데이트 파일을 내려받지 못했습니다.');
    }
  } finally {
    progress.dispose();
  }
}

class _DownloadDialog extends StatelessWidget {
  const _DownloadDialog({required this.progress});

  final ValueNotifier<double> progress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('업데이트 내려받는 중'),
      content: ValueListenableBuilder<double>(
        valueListenable: progress,
        builder: (context, value, _) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            LinearProgressIndicator(value: value == 0 ? null : value),
            const SizedBox(height: 12),
            Text(
              '${(value * 100).round()}%',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
