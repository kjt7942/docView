import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'reader_settings.dart';

class Bookmark {
  const Bookmark({
    required this.offset,
    required this.label,
    required this.createdAt,
  });

  /// 원문 기준 글자 위치.
  final int offset;
  final String label;
  final int createdAt;

  Map<String, Object> toJson() => {
    'offset': offset,
    'label': label,
    'createdAt': createdAt,
  };

  static Bookmark? fromJson(Object? json) {
    if (json is! Map) return null;
    final offset = json['offset'];
    final label = json['label'];
    final createdAt = json['createdAt'];
    if (offset is! int || label is! String) return null;
    return Bookmark(
      offset: offset,
      label: label,
      createdAt: createdAt is int ? createdAt : 0,
    );
  }
}

/// 최근에 연 문서.
class RecentEntry {
  const RecentEntry({
    required this.path,
    required this.name,
    required this.size,
    required this.openedAt,
  });

  final String path;
  final String name;
  final int size;
  final int openedAt;

  Map<String, Object> toJson() => {
    'path': path,
    'name': name,
    'size': size,
    'openedAt': openedAt,
  };

  static RecentEntry? fromJson(Object? json) {
    if (json is! Map) return null;
    final path = json['path'];
    final name = json['name'];
    if (path is! String || name is! String) return null;
    final size = json['size'];
    final openedAt = json['openedAt'];
    return RecentEntry(
      path: path,
      name: name,
      size: size is int ? size : 0,
      openedAt: openedAt is int ? openedAt : 0,
    );
  }
}

/// 리더 설정, 읽던 위치, 책갈피, 최근 문서를 기기 안의 JSON 파일 하나에 저장한다.
///
/// 문서는 `이름|크기`로 구분한다. 파일 선택기가 매번 다른 임시 경로로 복사해 주기 때문에
/// 경로를 키로 쓰면 같은 문서를 다시 열 때 기록을 잃는다.
class ReaderStore {
  ReaderStore(this._file);

  final File _file;
  Timer? _saveTimer;

  ReaderSettings settings = const ReaderSettings();
  final Map<String, int> positions = {};
  final Map<String, List<Bookmark>> bookmarks = {};
  final List<RecentEntry> recents = [];

  static ReaderStore? _instance;

  static Future<ReaderStore> open() async {
    final cached = _instance;
    if (cached != null) return cached;
    final dir = await getApplicationSupportDirectory();
    final store = ReaderStore(File('${dir.path}/docviewer_state.json'));
    await store.load();
    return _instance = store;
  }

  @visibleForTesting
  static void useForTesting(ReaderStore? store) => _instance = store;

  static String keyFor(String name, int size) => '$name|$size';

  /// 읽던 위치를 기록한다. 오래된 문서의 기록부터 지워 [maxPositions]개까지만 보관한다.
  void setPosition(String key, int offset, {int maxPositions = 300}) {
    positions.remove(key); // 다시 넣어 가장 최근 항목으로 만든다.
    positions[key] = offset;
    while (positions.length > maxPositions) {
      positions.remove(positions.keys.first);
    }
    saveSoon();
  }

  void removeRecent(String name, int size) {
    final key = keyFor(name, size);
    recents.removeWhere((r) => keyFor(r.name, r.size) == key);
    saveSoon();
  }

  Future<void> load() async {
    try {
      if (!await _file.exists()) return;
      final json = jsonDecode(await _file.readAsString());
      if (json is Map<String, dynamic>) loadJson(json);
    } catch (_) {
      // 손상된 파일은 무시하고 기본값으로 시작한다.
    }
  }

  void loadJson(Map<String, dynamic> json) {
    final s = json['settings'];
    if (s is Map<String, dynamic>) settings = ReaderSettings.fromJson(s);
    final p = json['positions'];
    if (p is Map) {
      p.forEach((k, v) {
        if (k is String && v is int) positions[k] = v;
      });
    }
    final b = json['bookmarks'];
    if (b is Map) {
      b.forEach((k, v) {
        if (k is! String || v is! List) return;
        bookmarks[k] = [for (final item in v) ?Bookmark.fromJson(item)];
      });
    }
    final r = json['recents'];
    if (r is List) {
      recents.addAll([for (final item in r) ?RecentEntry.fromJson(item)]);
    }
  }

  Map<String, Object> toJson() => {
    'settings': settings.toJson(),
    'positions': positions,
    'bookmarks': {
      for (final e in bookmarks.entries)
        e.key: [for (final b in e.value) b.toJson()],
    },
    'recents': [for (final r in recents) r.toJson()],
  };

  /// 잦은 호출(스크롤 중 위치 저장)을 모아서 한 번에 쓴다.
  void saveSoon() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 700), save);
  }

  Future<void> save() async {
    _saveTimer?.cancel();
    try {
      await _file.writeAsString(jsonEncode(toJson()));
    } catch (_) {
      // 저장 실패는 읽기를 막지 않는다.
    }
  }

  List<Bookmark> bookmarksOf(String key) =>
      bookmarks.putIfAbsent(key, () => []);

  /// 최근 문서 맨 앞에 [entry]를 올린다(같은 이름·크기는 하나로 합친다). 최대 [max]개.
  void addRecent(RecentEntry entry, {int max = 50}) {
    recents.removeWhere(
      (r) => keyFor(r.name, r.size) == keyFor(entry.name, entry.size),
    );
    recents.insert(0, entry);
    if (recents.length > max) recents.removeRange(max, recents.length);
    saveSoon();
  }
}
