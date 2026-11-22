import 'package:material_ui/material_ui.dart';

import 'library_screen.dart';

const _seedColor = Color(0xFF2F4B7C);

class DocViewerApp extends StatelessWidget {
  const DocViewerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '문서 뷰어',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.system,
      theme: _buildTheme(Brightness.light),
      darkTheme: _buildTheme(Brightness.dark),
      home: const LibraryScreen(),
      // PDF·동영상 등 아직 프레임워크 내장 Material을 쓰는 외부 패키지에도 테마·현지화를 넘겨준다.
      builder: (context, child) =>
          MaterialUiCompatibilityBridge(child: child ?? const SizedBox.shrink()),
    );
  }
}

ThemeData _buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: _seedColor,
    brightness: brightness,
  );
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: scheme.onSurface,
        fontSize: 20,
        fontWeight: FontWeight.w600,
      ),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
