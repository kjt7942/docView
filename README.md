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
앱이 읽을 수 있는 확장자(`pdf docx xlsx xls csv pptx hwp txt md log jpg jpeg png gif webp bmp`)는 MIME이 `octet-stream`처럼 불분명해도,
대문자 확장자(`.PDF`)나 이름에 점이 여러 개인 파일(`보고서.v2.docx`)도 확장자로 매칭합니다. 열 수 없는 `.doc` `.ppt` `.hwpx`는 등록하지 않습니다.

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

main에 푸시하면 GitHub Actions(`.github/workflows/release.yml`)가 APK를 빌드해 릴리스를 만든다.

1. `pubspec.yaml`의 `version`을 올린다. (예: `1.1.0+4` — `+` 뒤 빌드 번호도 반드시 증가)
2. 커밋 메시지에 사용자에게 보여줄 변경 내용을 쓴다. 이 메시지가 릴리스 노트가 되어 앱의 업데이트 안내 창에 표시된다.
3. `git push origin main` — `v<버전>` 릴리스가 이미 있으면 건너뛴다.
4. 워크플로우는 분석·테스트(`flutter analyze`, `flutter test`)가 통과해야 빌드한다. 결과물은 `docviewer-<버전>.apk`.

서명 키 시크릿(`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)이 없으면 디버그 키로 서명되어
**Pre-release**로 올라간다. 앱은 정식 릴리스(latest)만 확인하므로 자동 업데이트에 잡히지 않는다.

수동 빌드가 필요하면:

```bash
flutter build apk --release --dart-define=GITHUB_REPO=kjt7942/docView
```

## 자동 업데이트 동작

1. 앱을 켤 때 `releases/latest`를 조회한다(실패하면 조용히 무시).
2. 태그(`v1.1.0`)가 설치된 버전보다 크면 릴리스 노트와 함께 안내한다.
3. "업데이트"를 누르면 APK를 내려받고 시스템 설치 화면을 연다. Android는 보안상 설치 확인을 건너뛸 수 없다.
4. 같은 서명 키로 서명된 APK만 기존 앱을 덮어쓴다.

## 서명 키

릴리스 키(`docviewer-release.jks`)는 저장소에 없다. 이 PC의 `C:/Users/kjt79/Documents/docviewer-keys/`에 있고,
같은 값이 GitHub Actions 시크릿에 등록돼 있다. 로컬 빌드는 `android/key.properties`(gitignore)를 읽는다.
**키를 잃어버리면 기존 사용자에게 업데이트를 배포할 수 없으므로 이 폴더를 반드시 별도 장소에 백업하세요.**

## 라이선스

앱 코드는 저장소 정책을 따릅니다. 번들된 서드파티 라이선스는
`assets/third_party_licenses/`에 있습니다.

- pdfrx / PDFium (MIT, BSD-3-Clause)
- docx-preview (Apache-2.0)
- SheetJS Community Edition (Apache-2.0)
- pptx-browser (MIT)
- hwp.js (Apache-2.0)
- JSZip (MIT / GPLv3 예외)

---

# 개발일지

> 위 내용은 사용자용 문서이고, 아래는 개발 과정 기록입니다. 블로그/포트폴리오로 옮겨 쓰기 위해 코드·커밋 기록을 근거로 정리했습니다.

## 개요

- 프로젝트: 문서 뷰어 (docView) — <https://github.com/kjt7942/docView>
- 한 줄 설명: 광고 없이, 파일을 기기 밖으로 보내지 않고 PDF·Word·Excel·PowerPoint·HWP를 여는 Flutter 앱

## 목적

- 무료 문서 뷰어 앱은 광고가 붙거나 파일을 서버로 올려 변환하는 경우가 많다. 이를 피하고 **광고 없음 + 완전 로컬 렌더링**을 차별점으로 삼았다.
- 국내 사용 환경을 고려해 한글(.hwp)까지 하나의 앱에서 열도록 했다.
- 별도 서버 없이 GitHub Releases만으로 배포·자동 업데이트까지 해결한다.

## 구현한 주요 기능

코드(`lib/`, `android/`, `assets/web/`)를 읽고 확인한 기준이다.

- **포맷 판별**: `DocumentFormat.fromFileName`이 확장자로 PDF/Word/Excel/PowerPoint/한글/텍스트/이미지/기타를 구분 (`lib/src/document.dart`). 렌더러가 없는 포맷은 `UnsupportedFormatScreen`에서 조용히 실패하지 않고 안내.
- **PDF**: pdfrx(PDFium)로 직접 렌더링, 스크롤 중 페이지 카운터 갱신 (`pdf_viewer_screen.dart`).
- **DOCX/XLSX/PPTX/HWP/텍스트/이미지**: 번들된 JS 렌더러를 WebView에서 실행. 엑셀은 시트당 최대 200행 × 80열까지만 표시 (`assets/web/viewer.js`의 `MAX_ROWS`/`MAX_COLS`).
- **홈 화면**: 파일 선택, 최근 문서 목록(앱 실행 중 메모리에만 유지), 수동 업데이트 확인 버튼 (`library_screen.dart`).
- **"연결 프로그램" 통합 (Android)**: `ACTION_VIEW` 인텐트 필터(MIME + 확장자)로 파일 관리자·메신저·메일에서 바로 열기. `content://` 문서를 앱 캐시로 복사(최근 10개만 유지)한 뒤 Dart로 전달하고, 앱이 이미 떠 있어도 새 문서를 받는다 (`MainActivity.kt`, `incoming_file.dart`).
- **인앱 자동 업데이트**: 시작 시 GitHub Releases API 확인 → 릴리스 노트 안내 → APK 다운로드(진행률) → 설치 화면. 네트워크 실패는 조용히 무시. iOS는 릴리스 페이지로 안내 (`lib/src/update/`).
- **CI 릴리스**: main 푸시 시 `pubspec.yaml` 버전의 릴리스가 없으면 APK를 빌드해 올림 (`.github/workflows/release.yml`).

## 화면 흐름 / 아키텍처

```
앱 시작 ─ LibraryScreen ─┬─ 파일 선택 / 최근 문서 ─┐
   │  └ 조용히 업데이트 확인   └ 연결 프로그램으로 들어온 문서 ┘
   │                                              ▼
   │                                  DocumentViewerScreen (확장자로 라우팅)
   │                          ┌──────────────┼───────────────┐
   │                    PdfViewerScreen  WebDocumentScreen  UnsupportedFormatScreen
   │                       (PDFium)            │
   │                                 DocumentWebServer (127.0.0.1, /<token>/...)
   │                                           │
   │                                 viewer.html + viewer.js + vendor/*.js
   └─ 업데이트 있음 → 릴리스 노트 → APK 다운로드 → Android 설치 인텐트
```

새 포맷을 추가할 때는 렌더러 위젯을 만들고 `document_viewer_screen.dart`의 switch에 추가하면 되도록 설계했다.

## 기술 스택과 선택 이유

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 앱 | Flutter (Dart SDK ^3.13.5) | 한 코드베이스로 Android/iOS |
| PDF | pdfrx (PDFium) | 두 플랫폼에서 동일한 결과, 확대·텍스트 선택 지원 |
| 오피스/HWP | WebView + docx-preview, SheetJS, pptx-browser, hwp.js | Dart에 쓸 만한 DOCX/PPTX/HWP 렌더러가 없어 검증된 JS 라이브러리를 번들 |
| JS 번들 | esbuild (`tool/build_web_assets.mjs`) | 라이브러리를 오프라인용 단일 파일로 고정, 결과물 커밋 |
| 업데이트 | GitHub Releases API + http | 서버·광고·추적 없이 태그가 곧 버전 |
| 파일 선택 | file_picker, path_provider | 표준 패키지 |
| 네이티브 | Kotlin MethodChannel (APK 설치, 인텐트 수신) | 패키지 의존 없이 직접 처리 |

## 빌드 / 검증

빌드·테스트·웹 에셋 재생성 방법은 위 [빌드](#빌드) 섹션 참고. 테스트는 `test/`에 있다.
- `document_web_server_test`: 정적 파일 서빙, 토큰 불일치·누락 시 403, 허용 목록 밖 경로 404
- `update_service_test`: 버전 비교, 릴리스 파싱, 404/서버 오류/APK 자산 없음 처리
- `widget_test`: 확장자 판별, 첫 화면 렌더
- `live_release_test`: 실제 릴리스 대상 점검 (`LIVE_RELEASE_TEST`로 분리, 기본 실행에서는 네트워크 미사용)

## 개발 기록

git 커밋 시각 기준이다. (소스 파일 타임스탬프는 clone 시각이라 근거로 쓸 수 없어 커밋 기록만 사용)

| 일시 | 커밋 | 내용 |
| --- | --- | --- |
| 2026-10-19 16:57 | `a491269` | **1.0.0**: Flutter 프로젝트 생성, PDF(PDFium) + 로컬 서버/WebView 기반 DOCX·XLSX·PPTX·HWP 렌더링, GitHub Releases 업데이트, 서드파티 라이선스 동봉 |
| 2026-10-19 17:07 | `27c5bc1` | `UpdateService`에 API URL·현재 버전 주입 지점 추가 → 릴리스 JSON 파싱·버전 비교 단위 테스트, 실제 릴리스용 `LIVE_RELEASE_TEST` 분리 |
| 2026-10-20 07:51 | `38a35e7` | WebView 문서가 열리지 않던 버그 수정 (아래 트러블슈팅 1~3) |
| 2026-10-20 15:47 | `f77be8a` | **1.0.1**: 태그 푸시 시 APK 빌드·Release 업로드 워크플로우 추가. 서명 시크릿이 없으면 prerelease로만 올림 |
| 2026-10-20 15:50 | `a329e5f` | 워크플로우 트리거를 main 푸시로 변경, 이미 있는 버전이면 건너뜀 |
| 2026-10-20 16:16 | `561cd09` | **1.0.2**: "연결 프로그램" 목록 등록 + 외부 문서 바로 열기 |

## 개발 환경 / 에뮬레이터 점검

Android만 대상으로 점검한다. (2026-10-20 환경 구축)

| 항목 | 값 |
| --- | --- |
| Flutter | 3.47.7 stable (Dart 3.13.5), `D:	oolslutter` — 프로젝트 `.metadata` 리비전과 동일 |
| Android SDK | platform 35·36, build-tools 28.0.3·35·36, NDK r28c, CMake 3.22.1 |
| AVD | `docview_test` — Pixel 6, Android 15 (API 35, google_apis x86_64), RAM 3GB |
| 패키지 ID | `com.docviewer` (코틀린 네임스페이스 `com.docviewer.docviewer`와 다름) |

```bash
flutter pub get && flutter analyze && flutter test       # 이슈 0건, 테스트 18개 통과(+라이브 1개 skip)
emulator -avd docview_test
flutter run -d emulator-5554 --release --dart-define=GITHUB_REPO=kjt7942/docView
```

점검 결과(샘플 문서를 시스템 파일 선택기로 열어 확인):

| 포맷 | 수리 전 | 수리 후 |
| --- | --- | --- |
| PDF | 정상 | 정상 |
| DOCX | 오른쪽 잘림, 확대 없음 | 화면 폭에 맞춰 표시 + 핀치 줌 |
| XLSX / CSV | 정상 | 정상 |
| PPTX | 정상 | 정상 |
| 이미지 | 확대·회전 없음 | 화면 폭 맞춤, 핀치 줌, 90° 회전 버튼 |
| TXT | 정상 | 정상 |
| MD | 원문 그대로 표시 | 제목·목록(중첩)·표·인용·코드블록·굵게/기울임 렌더링 |
| HWP (실제 문서 `신재생에너지 설비의 지원 등에 관한 지침 일부개정 전문.hwp`, 256쪽) | **`Maximum call stack size exceeded`로 열리지 않음** | 정상 표시, 화면 폭에 맞춤 |
| 외부 앱에서 열기 실패 | 오류 표시 없이 홈으로 복귀 | 스낵바로 안내(권한 없음 / 가져오기 실패 구분) |
| 외부 앱에서 `content://`로 열기 | 미점검 | PDF·DOCX·HWP 모두 정상 (앱 종료 상태·실행 중 모두) |
| HWP 256쪽 메모리 | 렌더러 약 477MB, 쪽 표시가 항상 `256/256` | 약 274~300MB, 쪽 표시 정상(`4/256`) |

## 스크린샷

에뮬레이터(Pixel 6, 1080×2400)에서 캡처. `docs/screenshots/`.

| 화면 | 파일 |
| --- | --- |
| 홈 | `01_home.png` |
| PDF | `02_pdf.png` |
| DOCX | `03_docx.png` |
| XLSX | `04_xlsx.png` |
| PPTX | `05_pptx.png` |
| 이미지 | `06_image.png` |
| TXT / CSV / MD | `07_txt.png` `08_csv.png` `09_md.png` |
| 이미지 회전 | `10_image_rotated.png` |
| HWP | `11_hwp.png` `13_hwp_table_page.png` |
| 외부 문서 열기 실패 안내 | `12_open_error.png` |

## 트러블슈팅 · 배운 점

1. **WebView 문서가 전부 403으로 안 열림** (`38a35e7`)
   - 원인: 로컬 서버가 모든 요청에 `?token=`을 요구했는데, `viewer.html`이 불러오는 CSS/JS/문서 요청에는 쿼리가 붙지 않음.
   - 해결: 토큰을 경로 첫 세그먼트(`/<token>/...`)로 옮기고 `viewer.html`/`viewer.js`의 자원 참조를 상대 경로로 변경. 상대 경로 요청은 같은 토큰을 자동으로 달고 나간다 (`document_web_server.dart`). 서버 테스트도 이 방식에 맞춰 수정.
2. **Android 9+에서 `ERR_CLEARTEXT_NOT_PERMITTED`** (`38a35e7`)
   - 원인: 기본 정책이 평문 HTTP를 차단해 127.0.0.1 서버에 접속 불가.
   - 해결: 루프백(`127.0.0.1`, `localhost`)에만 평문을 허용하는 `network_security_config.xml` 추가. 그 외 도메인(GitHub 등)은 HTTPS만 허용 유지.
3. **iOS ATS가 로컬 HTTP 차단** (`38a35e7`): `Info.plist`에 `NSAllowsLocalNetworking` 추가.
4. **pptx-browser 4.1.5 번들 후 `ReferenceError`**
   - 원인: `renderTextBody`가 `defRPr`를 선언 전에 참조(TDZ).
   - 해결: `tool/build_web_assets.mjs`가 번들 전에 소스의 선언 위치를 위로 옮기는 패치를 적용. 패치 지점을 못 찾으면 에러로 중단해 버전 변경을 알린다.
5. **hwp.js ESM 빌드가 Node `fs`를 import**: 브라우저 번들에서는 빈 shim으로 대체.
6. **서명 키 없이 빌드하면 자동 업데이트가 깨짐** (`f77be8a`): 디버그 키로 서명한 APK는 기존 설치본을 덮어쓸 수 없다. 서명 시크릿이 없으면 prerelease로 올려 앱의 "latest" 조회에 잡히지 않게 했다.
7. **태그 푸시가 막힌 환경** (`a329e5f`): main 푸시로 트리거하고, `pubspec.yaml` 버전의 릴리스가 이미 있으면 건너뛰도록 변경 → 버전만 올리면 릴리스 생성.
8. **큰 파일 복사로 UI 멈춤 방지**: 외부에서 받은 문서의 캐시 복사를 백그라운드에서 처리 (`MainActivity.kt`).
9. **실제 HWP 문서가 `Maximum call stack size exceeded`로 열리지 않음**
   - 파서(`HwpJs.parse`)는 Node에서 성공해서 렌더링 단계 문제로 좁혔고, 데스크톱 Chrome(헤드리스)에서 같은 예외를 재현해 스택의 반복 함수(`xn`)를 찾았다.
   - 원인: hwp.js 0.0.3의 `splitTable`(표를 페이지 높이에 맞춰 쪼개는 재귀 함수)이, 첫 행이 한 페이지보다 높으면 "한 행도 못 넣음 → 같은 표로 재귀"를 영원히 반복.
   - 해결: 새 페이지(`targetHeight >= contentHeight`)에서도 안 들어가는 첫 행은 강제로 넣어 진행시키고 셀 분할은 건너뜀. `tool/build_web_assets.mjs`가 번들 전에 패치(패치 지점을 못 찾으면 중단).
10. **HWP 본문 줄이 페이지 오른쪽에서 잘림**
    - 원인: 뷰어 CSS의 전역 `box-sizing: border-box`가 hwp.js 페이지의 여백(padding)을 폭 안으로 넣어 본문 영역이 좁아짐. hwp.js는 `content-box`를 전제로 폭을 계산한다.
    - 해결: `.hwp-host div[data-page-number]` 안쪽만 `content-box`로 되돌림(툴바는 기존 유지).
11. **화면 맞춤이 먹지 않음**
    - 원인: 뷰포트의 `minimum-scale`을 1 미만으로 두면 내용이 넓을 때 WebView가 레이아웃 폭을 키워 `clientWidth`가 실제 화면보다 커진다. 에뮬레이터에서 `avail=485`가 찍혀 확인.
    - 해결: `minimum-scale=1`(확대만 허용)로 고정하고, 맞춤 계산에서 `.root` 패딩 24px를 뺌.
    - 같은 맥락으로 페이지가 `margin: auto`로 가운데 정렬돼 있어 페이지 각각이 아니라 컨테이너 전체에 `zoom`을 걸어야 위치가 어긋나지 않는다.
12. **외부 문서 열기 실패가 조용히 사라짐**: `MainActivity.resolveIncoming`이 예외를 `null`로 삼키던 것을 `open_failed` 오류로 전달해 `LibraryScreen`이 스낵바로 보여준다.
13. **HWP 수백 쪽 문서의 메모리**: 페이지를 모두 한 번에 만들어 렌더러 메모리가 약 477MB였다. 화면 밖 페이지에 CSS `content-visibility: auto`를 주어 레이아웃·페인트를 건너뛰게 하자 약 274MB로 줄었고, 스크롤해도 뒤쪽 페이지(표 포함)가 정상 렌더링된다. 부수 효과로 쪽 표시도 실제 보고 있는 쪽으로 바뀌었다.
14. **외부 인텐트 점검**: adb shell은 `externalstorage` URI에 권한을 줄 수 없어 막힌다. MediaStore URI(`content://media/external/downloads/<id>`)와 `--grant-read-uri-permission`으로 실제 앱이 보내는 방식과 같게 재현했다.
15. **"연결 프로그램" 등록 누락**: 확장자 필터에 이미지가 없었고 대문자·다중 점 경로가 매칭되지 않았다. `adb shell cmd package query-activities`로 시스템이 실제로 어떻게 해석하는지 확인했더니, 확장자 필터가 한 건도 매칭되지 않았다.
    - 원인: `pathPattern`은 단순 glob이라 문자 클래스(`[pP]`)를 지원하지 않고(글자 그대로 취급), `.*`가 첫 번째 점에서 멈춰 이름에 점이 더 있는 경로에서 실패한다.
    - 해결: 지원 확장자마다 소문자·대문자 두 벌 × 점 0~3개 변형을 나열(`AndroidManifest.xml`). MIME 별칭(`image/jpg`, `application/x-msexcel`, `text/x-markdown` 등)도 추가하고 `MainActivity.kt`의 확장자 복원 표에 반영했다. 열 수 없는 확장자는 제외.
    - 검증: 14개 경로/MIME 조합을 질의해 지원 확장자는 모두 연결, `.doc` `.ppt` `.hwpx` `.zip` `.pdf.zip`은 연결되지 않음을 확인. MIME이 `octet-stream`인 HWP를 실제로 열어 표시까지 확인.

배운 점: WebView + `file://` 조합은 `fetch()`가 막혀 로컬 서버가 필요하다. 그 서버를 안전하게 쓰려면 바인딩 주소(루프백), 토큰, 경로 허용 목록, 플랫폼별 평문 HTTP 정책을 함께 맞춰야 한다.

## 향후 계획 / TODO

코드에서 확인된 한계 기준이다.

- [ ] 마크다운 링크 동작·이미지 표시 (현재는 텍스트만)
- [ ] 실기기(저사양)에서 HWP 대용량 문서 메모리 확인 — 현재 수치는 에뮬레이터 기준
- [ ] 레거시 `.doc` / `.ppt` 렌더러 (현재 안내 화면만 표시)
- [ ] HWPX 및 배포용·암호 HWP 지원
- [ ] HEIC: 확장자 목록에는 있으나 `webKind` 매핑이 없어 실제로는 열리지 않음 → 지원하거나 목록에서 제거
- [ ] 최근 문서 목록 영구 저장 (현재 `_recent`는 메모리 전용이라 앱 재시작 시 사라짐)
- [ ] 엑셀 200행 × 80열 제한 완화 (가상 스크롤 등)
- [ ] PPTX 복잡한 차트 정확도 개선
- [ ] iOS 배포 빌드 (macOS + TestFlight)
- [ ] CI에서 `flutter analyze`/`flutter test`가 `continue-on-error`라 실패해도 릴리스됨 → 엄격하게 전환
- [ ] 서명 키 폴더를 PC 밖(클라우드 등)에도 백업

## 기획 단계 (미작성)

자료조사용 최초 질문과 개발 착수 시 Claude에게 준 요청 프롬프트는 저장소에 남아 있지 않아 작성하지 못했습니다. 원문을 주시면 이 위치에 그대로 인용해 넣겠습니다.
