import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';

import 'src/app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // 동영상 재생 엔진(libmpv) 초기화.
  MediaKit.ensureInitialized();
  runApp(const DocViewerApp());
}
