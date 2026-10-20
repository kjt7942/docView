# 문서 뷰어 (docView)

광고 없이 PDF·Word·Excel·PowerPoint·HWP 문서를 여는 Android/iOS 앱입니다.
파일은 기기 밖으로 나가지 않습니다. 모든 렌더링은 로컬에서 이뤄집니다.

## 지원 포맷

| 포맷 | 확장자 | 렌더러 | 품질 |
| --- | --- | --- | --- |
| PDF | `.pdf` | PDFium (pdfrx) | 매우 좋음 · 확대/스크롤/텍스트 선택 |
| Word | `.docx` | docx-preview | 좋음 · 페이지 레이아웃/표/이미지 |
| Excel | `.xlsx`, `.xls`, `.csv` | SheetJS | 좋음 · 시트/값 · 200행·80열까지 미리보기 |
| PowerPoint | `.pptx` | pptx-browser | 보통 · 도형/텍스트/이미지 · 복잡한 차트는 근사 |
| 한글 | `.hwp` (5.0) | hwp.js | 보통 · 본문/표 · 배포용/암호 문서·HWPX 미지원 |
| 텍스트 | `.txt`, `.md`, `.log` | TextDecoder | 좋음 |
| 이미지 | `.jpg`, `.png`, `.gif`, `.webp`, `.bmp` | WebView | 좋음 |

파일 관리자·메신저·메일 등에서 문서를 누르면 "연결 프로그램" 목록에 이 앱이 나타납니다(Android).
한글(.hwp) 등 MIME이 불분명한 파일은 확장자로 매칭하며, 일부 앱은 "다른 앱으로 열기 → 파일 선택"을 거쳐야 할 수 있습니다.

레거시 `.doc` / `.ppt`는 아직 열 수 없습니다(PDF나 DOCX로 변환 필요).

## 설치

[Releases](https://github.com/kjt7942/docView/releases/latest)에서
`docviewer-<버전>.apk`를 내려받아 설치합니다.

- Android 7.0 이상
- iOS는 아직 배포 빌드가 없습니다. macOS에서 `flutter build ipa` 후 TestFlight로 배포할 수 있습니다.

## 자동 업데이트

- 앱 시작 시 GitHub Releases API에서 최신 릴리스를 확인합니다(조용히 실패).
- 새 버전이 있으면 릴리스 노트와 함께 안내하고, APK를 내려받아 설치 화면으로 넘깁니다.
- 최초 1회 "알 수 없는 앱 설치" 권한 허용이 필요합니다.
- iOS는 정책상 인앱 설치가 불가능해 릴리스 페이지/스토어로 안내합니다.
- 업데이트 채널은 빌드 시 주입됩니다:
  `--dart-define=GITHUB_REPO=kjt7942/docView`

## 구조

```
lib/
  src/
    config.dart                      # GitHub 저장소/릴리스 설정
    document.dart                    # 확장자 감지, 지원 포맷, webKind 매핑
    library_screen.dart              # 홈(최근 문서, 파일 열기)
    update/                          # 업데이트 확인·다운로드·설치
    viewer/
      document_viewer_screen.dart    # 포맷별 렌더러 라우팅
      pdf_viewer_screen.dart         # PDFium
      web_document_screen.dart       # WebView 호스트
      document_web_server.dart       # 127.0.0.1 전용 오프라인 서버
assets/web/                          # 뷰어 HTML/CSS/JS + 벤더 라이브러리
android/app/src/main/kotlin/...      # APK 설치 MethodChannel
```

DOCX/XLSX/PPTX/HWP는 WebView에서 렌더링합니다. WebView는 `file://`에서
`fetch()`를 막기 때문에, 앱이 **127.0.0.1에만 바인딩된 임시 HTTP 서버**를 띄우고
추측 불가능한 토큰으로 문서 바이트를 제공합니다. 외부 통신은 없습니다.

## 빌드

```bash
flutter pub get
flutter run                       # 개발
flutter build apk --release \
  --dart-define=GITHUB_REPO=kjt7942/docView
```

검증:

```bash
flutter analyze
flutter test

# 실제 릴리스를 대상으로 업데이트 경로 확인(네트워크 필요)
flutter test --dart-define=LIVE_RELEASE_TEST=true \
  --dart-define=GITHUB_REPO=kjt7942/docView test/live_release_test.dart
```

### 웹 렌더러 번들 재생성

`assets/web/vendor`의 JS는 다음 스크립트로 재생성합니다(Node 20+).

```bash
node tool/build_web_assets.mjs
```

`pptx-browser@4.1.5`에는 `defRPr`를 선언 전에 참조하는 TDZ 버그가 있어
번들링 단계에서 해당 선언을 위로 옮기는 패치를 적용합니다(스크립트에 명시).

## 릴리스 절차

1. `pubspec.yaml`의 `version`을 올립니다. (예: `1.1.0+2`)
2. `flutter build apk --release --dart-define=GITHUB_REPO=kjt7942/docView`
3. 에셋 이름을 버전에 맞춰 바꿉니다.
   ```bash
   cp build/app/outputs/flutter-apk/app-release.apk \
      build/app/outputs/flutter-apk/docviewer-1.1.0.apk
   ```
4. `gh release create v1.1.0 build/app/outputs/flutter-apk/docviewer-1.1.0.apk`
5. 앱은 태그(`v1.1.0`)를 버전으로 읽고, `.apk` 자산을 설치 파일로 사용합니다.

## 서명 키

`android/key.properties`와 `*.jks`는 저장소에 포함되지 않습니다.
릴리스 키를 잃어버리면 기존 사용자에게 업데이트를 배포할 수 없으므로
`C:/Users/Owner/Documents/docviewer-keys/`를 반드시 백업하세요.

## 라이선스

앱 코드는 저장소 정책을 따릅니다. 번들된 서드파티 라이선스는
`assets/third_party_licenses/`에 있습니다.

- pdfrx / PDFium (MIT, BSD-3-Clause)
- docx-preview (Apache-2.0)
- SheetJS Community Edition (Apache-2.0)
- pptx-browser (MIT)
- hwp.js (Apache-2.0)
- JSZip (MIT / GPLv3 예외)
