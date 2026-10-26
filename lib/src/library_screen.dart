import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'config.dart';
import 'document.dart';
import 'incoming_file.dart';
import 'library_search.dart';
import 'media/device_media.dart';
import 'reader/reader_store.dart';
import 'system_bars.dart';
import 'update/update_ui.dart';
import 'viewer/document_viewer_screen.dart';

/// 앱을 켜면 보이는 첫 화면. 파일을 고르고, 최근에 연 문서를 다시 연다.
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key});

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final List<DocumentFile> _recent = [];
  bool _picking = false;

  // 검색
  final _searchController = TextEditingController();
  bool _searching = false;
  bool _includeBody = false;
  bool _searchBusy = false;
  int _searchGen = 0;
  Timer? _searchDebounce;
  List<SearchResult> _results = const [];

  @override
  void initState() {
    super.initState();
    // 목록(탐색기) 화면에서는 시스템 내비게이션 버튼을 항상 보여 준다.
    SystemBars.show(true);
    // 시작할 때 조용히 업데이트를 확인한다. 실패해도 앱 사용에는 지장이 없다.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) checkForUpdates(context);
    });

    _loadRecents();

    // 다른 앱에서 "연결 프로그램"으로 문서를 열어 온 경우.
    IncomingFileService.listen(_openIncoming, onError: _showError);
    IncomingFileService.initialFile().then(
      (file) {
        if (file != null) _openIncoming(file);
      },
      onError: (Object e) =>
          _showError(e is PlatformException ? e.message : null),
    );
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    IncomingFileService.stopListening();
    super.dispose();
  }

  /// 지난번에 열었던 문서를 불러온다. 임시 파일이 지워진 문서는 목록에서 뺀다.
  Future<void> _loadRecents() async {
    final store = await ReaderStore.open();
    final loaded = [
      for (final e in store.recents)
        // content:// 는 동영상·음악을 복사 없이 연 것(권한 유지). 나머지는 파일이 남아 있을 때만.
        if (e.path.startsWith('content://') || File(e.path).existsSync())
          DocumentFile(path: e.path, name: e.name, size: e.size),
    ];
    if (!mounted) return;
    setState(() {
      // 불러오는 사이 새로 연 문서가 있으면 그 뒤에 붙인다.
      final known = _recent.map((d) => '${d.name}|${d.size}').toSet();
      _recent.addAll(
        loaded.where((d) => !known.contains('${d.name}|${d.size}')),
      );
    });
  }

  Future<void> _showAbout() async {
    String version = '';
    try {
      final info = await PackageInfo.fromPlatform();
      version = info.version;
    } catch (_) {
      // 버전을 못 읽어도 정보 창은 보여 준다.
    }
    if (!mounted) return;
    showAboutDialog(
      context: context,
      applicationName: '문서 뷰어',
      applicationVersion: version,
      applicationIcon: const Icon(Icons.description_outlined, size: 40),
      children: const [
        SizedBox(height: 8),
        Text(
          '광고 없이 PDF·Word·Excel·PowerPoint·한글 문서를 여는 뷰어입니다.\n'
          '문서는 기기 밖으로 전송되지 않으며, 모든 처리는 기기 안에서 이뤄집니다.',
        ),
      ],
    );
  }

  void _showError(String? message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message ?? '문서를 가져오지 못했습니다.')));
  }

  void _openIncoming(DocumentFile file) {
    if (!mounted) return;
    _remember(file);
    _openDocument(file);
  }

  Future<void> _pickDocument() async {
    if (_picking) return;
    setState(() => _picking = true);
    try {
      final picked = await FilePicker.pickFile(
        // 확장자 필터를 쓰면 안드로이드가 MIME을 모르는 형식(.hwpx 등)을 목록에서 숨긴다.
        // 모든 파일을 보여 주고, 열 수 없는 형식은 뷰어가 안내한다.
        type: FileType.any,
      );
      final path = picked?.path;
      if (picked == null || path == null) return;

      final document = DocumentFile(
        path: path,
        name: picked.name,
        size: await picked.length() ?? 0,
      );
      _remember(document);
      _openDocument(document);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('파일을 여는 중 문제가 발생했습니다.')));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  /// 동영상·음악은 전용 선택기로 고른다(복사 없이 원본을 바로 재생).
  Future<void> _pickMedia() async {
    if (_picking) return;
    if (!Platform.isAndroid) {
      await _pickDocument();
      return;
    }
    setState(() => _picking = true);
    try {
      final media = await DeviceMedia.pickMedia();
      if (media == null || !mounted) return;
      _remember(media);
      _openDocument(media);
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  void _remember(DocumentFile document) {
    setState(() {
      _recent.removeWhere(
        (item) => item.name == document.name && item.size == document.size,
      );
      _recent.insert(0, document);
    });
    ReaderStore.open().then(
      (store) => store.addRecent(
        RecentEntry(
          path: document.path,
          name: document.name,
          size: document.size,
          openedAt: DateTime.now().millisecondsSinceEpoch,
        ),
      ),
    );
  }

  /// 목록에서만 지운다(원본 파일은 그대로). 잠시 동안 실행 취소할 수 있다.
  void _removeRecent(DocumentFile document, int position) {
    setState(() => _recent.removeAt(position));
    ReaderStore.open().then(
      (store) => store.removeRecent(document.name, document.size),
    );
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Text('"${document.name}"을(를) 목록에서 지웠습니다.'),
          action: SnackBarAction(
            label: '실행 취소',
            onPressed: () {
              if (!mounted) return;
              _remember(document);
            },
          ),
        ),
      );
  }

  // ───────── 검색 ─────────

  void _onSearchChanged(String _) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), _runSearch);
  }

  Future<void> _runSearch() async {
    final query = _searchController.text;
    final gen = ++_searchGen;
    if (query.trim().isEmpty) {
      setState(() {
        _results = const [];
        _searchBusy = false;
      });
      return;
    }
    setState(() => _searchBusy = true);
    final results = await searchDocuments(
      _recent,
      query,
      includeBody: _includeBody,
      isCancelled: () => gen != _searchGen || !mounted,
    );
    if (!mounted || gen != _searchGen) return;
    setState(() {
      _results = results;
      _searchBusy = false;
    });
  }

  void _closeSearch() {
    _searchGen++;
    setState(() {
      _searching = false;
      _searchBusy = false;
      _results = const [];
      _searchController.clear();
    });
  }

  void _openDocument(DocumentFile document, {String? query}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => DocumentViewerScreen(
          document: document,
          initialQuery: query,
          siblings: List.of(_recent),
        ),
      ),
    );
  }

  Widget _buildSearchBody(ThemeData theme) {
    final query = _searchController.text.trim();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          child: Row(
            children: [
              FilterChip(
                label: const Text('본문 포함'),
                selected: _includeBody,
                onSelected: (v) {
                  setState(() => _includeBody = v);
                  _runSearch();
                },
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _includeBody ? '파일명과 TXT·LOG·MD·CSV 본문을 찾습니다.' : '파일명만 찾습니다.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (_searchBusy) const LinearProgressIndicator(minHeight: 2),
        Expanded(
          child: query.isEmpty
              ? Center(
                  child: Text(
                    '최근 문서 ${_recent.length}개에서 찾습니다.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                )
              : _results.isEmpty && !_searchBusy
              ? Center(child: Text('"$query" 검색 결과가 없습니다.'))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: _results.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final result = _results[index];
                    return _DocumentTile(
                      document: result.document,
                      snippet: result.snippet,
                      onTap: () => _openDocument(
                        result.document,
                        query: result.snippet != null ? query : null,
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        leading: _searching
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: _closeSearch,
              )
            : null,
        title: _searching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: '최근 문서 검색',
                  border: InputBorder.none,
                ),
                onChanged: _onSearchChanged,
                onSubmitted: (_) => _runSearch(),
              )
            : const Text('문서 뷰어'),
        actions: _searching
            ? [
                if (_searchController.text.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.clear),
                    tooltip: '지우기',
                    onPressed: () {
                      _searchController.clear();
                      _runSearch();
                    },
                  ),
              ]
            : [
                if (_recent.isNotEmpty)
                  IconButton(
                    onPressed: () => setState(() => _searching = true),
                    icon: const Icon(Icons.search),
                    tooltip: '검색',
                  ),
                PopupMenuButton<String>(
                  tooltip: '더 보기',
                  onSelected: (value) {
                    if (value == 'update') checkForUpdates(context, manual: true);
                    if (value == 'about') _showAbout();
                  },
                  itemBuilder: (context) => [
                    if (AppConfig.hasReleaseChannel)
                      const PopupMenuItem(
                        value: 'update',
                        child: Text('업데이트 확인'),
                      ),
                    const PopupMenuItem(
                      value: 'about',
                      child: Text('앱 정보 · 오픈소스 라이선스'),
                    ),
                  ],
                ),
                if (_recent.isNotEmpty)
                  IconButton(
                    onPressed: _picking ? null : _pickDocument,
                    icon: const Icon(Icons.folder_open_outlined),
                    tooltip: '문서 열기',
                  ),
              ],
      ),
      body: _searching
          ? _buildSearchBody(theme)
          : _recent.isEmpty
          ? _EmptyState(
              onOpen: _pickDocument,
              onOpenMedia: _pickMedia,
              busy: _picking,
            )
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              itemCount: _recent.length + 1,
              separatorBuilder: (_, index) => index == 0
                  ? const SizedBox.shrink()
                  : const SizedBox(height: 8),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 8),
                    child: Text(
                      '최근 문서',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  );
                }
                final document = _recent[index - 1];
                return Dismissible(
                  key: ValueKey('${document.name}|${document.size}'),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      Icons.delete_outline,
                      color: theme.colorScheme.onErrorContainer,
                    ),
                  ),
                  onDismissed: (_) => _removeRecent(document, index - 1),
                  child: _DocumentTile(
                    document: document,
                    onTap: () => _openDocument(document),
                  ),
                );
              },
            ),
      floatingActionButton: _recent.isEmpty || _searching
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                FloatingActionButton.small(
                  heroTag: 'open-media',
                  onPressed: _picking ? null : _pickMedia,
                  tooltip: '동영상 · 음악 열기',
                  child: const Icon(Icons.movie_outlined),
                ),
                const SizedBox(height: 12),
                FloatingActionButton.extended(
                  heroTag: 'open-document',
                  onPressed: _picking ? null : _pickDocument,
                  icon: const Icon(Icons.add),
                  label: const Text('문서 열기'),
                ),
              ],
            ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.onOpen,
    required this.onOpenMedia,
    required this.busy,
  });

  final VoidCallback onOpen;
  final VoidCallback onOpenMedia;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Icon(
                  Icons.document_scanner_outlined,
                  size: 44,
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(height: 28),
              Text(
                '광고 없이, 필요한 것만',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              Text(
                '기기에 있는 문서·사진·동영상을 바로 열어 보세요.\n파일은 서버로 전송되지 않습니다.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 28),
              FilledButton.icon(
                onPressed: busy ? null : onOpen,
                icon: const Icon(Icons.folder_open_outlined),
                label: const Text('문서 열기'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 14,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: busy ? null : onOpenMedia,
                icon: const Icon(Icons.movie_outlined),
                label: const Text('동영상 · 음악 열기'),
              ),
              const SizedBox(height: 40),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  for (final format in const [
                    DocumentFormat.pdf,
                    DocumentFormat.word,
                    DocumentFormat.excel,
                    DocumentFormat.powerpoint,
                    DocumentFormat.hwp,
                    DocumentFormat.text,
                    DocumentFormat.image,
                    DocumentFormat.video,
                    DocumentFormat.audio,
                  ])
                    _FormatChip(format: format),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FormatChip extends StatelessWidget {
  const _FormatChip({required this.format});

  final DocumentFormat format;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = format.supported;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: enabled
            ? theme.colorScheme.secondaryContainer
            : theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            enabled ? Icons.check : format.icon,
            size: 14,
            color: enabled
                ? theme.colorScheme.onSecondaryContainer
                : theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 5),
          Text(
            format.label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: enabled
                  ? theme.colorScheme.onSecondaryContainer
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({
    required this.document,
    required this.onTap,
    this.snippet,
  });

  final DocumentFile document;
  final VoidCallback onTap;

  /// 본문 검색으로 찾았을 때 보여줄 주변 문장.
  final String? snippet;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final format = document.format;
    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: format.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(format.icon, color: format.color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      document.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${format.label} · ${document.readableSize}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (snippet != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        snippet!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
