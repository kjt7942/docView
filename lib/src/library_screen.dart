import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'document.dart';
import 'incoming_file.dart';
import 'library_search.dart';
import 'reader/reader_store.dart';
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
        if (File(e.path).existsSync())
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
        builder: (_) =>
            DocumentViewerScreen(document: document, initialQuery: query),
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
                IconButton(
                  onPressed: () => checkForUpdates(context, manual: true),
                  icon: const Icon(Icons.system_update_alt),
                  tooltip: '업데이트 확인',
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
          ? _EmptyState(onOpen: _pickDocument, busy: _picking)
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
                return _DocumentTile(
                  document: document,
                  onTap: () => _openDocument(document),
                );
              },
            ),
      floatingActionButton: _recent.isEmpty || _searching
          ? null
          : FloatingActionButton.extended(
              onPressed: _picking ? null : _pickDocument,
              icon: const Icon(Icons.add),
              label: const Text('문서 열기'),
            ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onOpen, required this.busy});

  final VoidCallback onOpen;
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
                '기기에 있는 문서를 열어 바로 확인하세요.\n파일은 서버로 전송되지 않습니다.',
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
