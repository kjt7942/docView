# 문서 뷰어 (docView)

광고 없이 PDF·Word·Excel·PowerPoint·HWP 문서를 여는 Android/iOS 앱입니다.
파일은 기기 밖으로 나가지 않습니다. 모든 렌더링은 로컬에서 이뤄집니다.

## 지원 포맷

| 포맷 | 확장자 | 렌더러 | 품질 |
| --- | --- | --- | --- |
| PDF | `.pdf` | PDFium (pdfrx) | 매우 좋음 · 확대/스크롤/텍스트 선택 |
| Word | `.docx` | docx-preview | 좋음 · 페이지 레이아웃/표/이미지 |
| Word 97-2003 | `.doc` | @file-viewer/doc (MS-DOC 파서) | 좋음 · 서식/표/이미지, 화면 폭에 맞춤 |
| Excel | `.xlsx`, `.xls`, `.csv` | SheetJS | 좋음 · 시트/값 · 200행·80열까지 미리보기 |
| PowerPoint | `.pptx` | pptx-browser | 보통 · 도형/텍스트/이미지 · 복잡한 차트는 근사 |
| PowerPoint 97-2003 | `.ppt` | 자체 추출기 (`ppt-text.js`) | **텍스트만** · 도형·이미지·서식은 표시하지 않음 |
| 한글 | `.hwp` (5.0) | hwp.js (+ rhwp 보조) | 보통 · 본문/표 |
| 한글 | `.hwpx` | rhwp (Rust/WASM) | 좋음 · 페이지 레이아웃/표/서식 |
| 텍스트 | `.txt`, `.log` | **전용 리더** (Flutter 네이티브) | 좋음 · 아래 "TXT 리더" 참고 |
| 마크다운 | `.md` | 자체 변환기 (WebView) | 좋음 · 제목/목록/표/인용/코드 |
| 이미지 | `.jpg`, `.png`, `.gif`, `.webp`, `.bmp` | WebView | 좋음 |

파일 관리자·메신저·메일 등에서 문서를 누르면 "연결 프로그램" 목록에 이 앱이 나타납니다(Android).
앱이 읽을 수 있는 확장자(`pdf doc docx xlsx xls csv ppt pptx hwp hwpx txt md log jpg jpeg png gif webp bmp`)는 MIME이 `octet-stream`처럼 불분명해도,
대문자 확장자(`.PDF`)나 이름에 점이 여러 개인 파일(`보고서.v2.docx`)도 확장자로 매칭합니다.

### 암호가 걸린 문서

| 포맷 | 동작 |
| --- | --- |
| PDF | 비밀번호 입력창 → 틀리면 다시 입력 |
| DOCX / XLSX / PPTX | Office 2010 이상의 암호화(Agile, AES)를 앱 안에서 복호화. 틀리면 다시 입력 |
| HWP / HWPX | 비밀번호 입력창(rhwp). 틀리면 다시 입력 |
| 구형 DOC / PPT, Office 2007 이전 암호화 | 열 수 없음. 이유를 안내하고 암호 해제 후 저장하도록 안내 |

복호화와 렌더링은 모두 기기 안에서 이뤄지며 비밀번호는 저장하지 않습니다.

## TXT 리더

`.txt` / `.log`는 WebView가 아니라 전용 리더(`lib/src/reader/`)로 엽니다. 소설처럼 긴 글을 오래 읽는 용도를 기준으로 만들었습니다.

| 기능 | 내용 |
| --- | --- |
| 인코딩 자동 판별 | UTF-8(BOM 유무) · UTF-16 BOM · **CP949(EUC-KR)**. 한국어 TXT는 CP949인 경우가 많아 따로 구현했습니다. |
| 글자 모양 | 글꼴(고딕·명조·고정폭·필기체), 글자 크기, **줄 간격**, **자간**, 문단 간격, 좌우 여백 |
| 색상 | 프리셋 6종(흰색·세피아·회색·연두·다크·검정) + 배경색/글자색 팔레트에서 따로 선택 |
| 눈 보호 | **블루라이트 줄이기**(화면을 따뜻한 색으로), **화면 어둡게**, 한 번에 켜는 "독서 모드", 하단 눈 아이콘으로 빠르게 켜고 끄기 |
| 넘김 | 화면 **아래쪽을 살짝 누르면 다음 화면**, **길게 누르고 있으면 스크롤하듯 계속** 넘어감. 위쪽은 반대 방향, 가운데를 누르면 메뉴 표시/숨김 |
| 넘김 설정 | **한 번에 넘기는 거리**(화면의 30~100%), 길게 누를 때 속도(초당 0.5~5화면), 탭 넘김 끄기 |
| 개행 문자 제거 | 줄 끝에서 억지로 끊긴 줄을 이어 붙여 화면 폭에 맞춰 보여줍니다. 문장 부호로 끝나는 줄, 빈 줄, 들여쓰기로 시작하는 줄은 문단 경계로 봅니다. |
| 책갈피 | 현재 위치 추가 · 목록(미리보기와 위치 %) · 탭해서 이동 · 삭제. 글자 크기나 개행 제거를 바꿔도 같은 자리로 돌아옵니다. |
| 본문 검색 | 문서 안에서 찾기: 결과 개수 표시, 이전/다음 이동, 대소문자 무시, 찾은 단어 강조 |
| 이어 읽기 | 읽던 위치와 설정을 자동 저장합니다. |

홈 화면의 **검색**은 최근 문서를 찾습니다. 기본은 파일명이고, **"본문 포함"**을 켜면 TXT·LOG·MD·CSV 본문까지 찾아 주변 문장을 미리 보여주며, 결과를 누르면 리더가 해당 단어를 바로 찾아 보여줍니다.
최근 문서는 이제 앱을 다시 켜도 유지됩니다.

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
- rhwp / @rhwp/core (MIT) — HWPX, 암호 HWP
- @file-viewer/doc (MIT) — 구형 .doc, 내부 의존 DOMPurify (Apache-2.0 / MPL-2.0)
- JSZip (MIT / GPLv3 예외)
- `assets/cp949.bin`: 통합형 한글(CP949) 변환표. Python 표준 코덱에서 생성한 사실 데이터이며 `tool/make_cp949.py`로 재생성한다.

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
| 업데이트 안내 | `14_update_dialog.png` |
| DOC / PPT(텍스트) / HWPX | `15_doc.png` `16_ppt.png` `17_hwpx.png` |
| 비밀번호 입력 (PDF / DOCX / HWP) | `18_password_pdf.png` `19_password_docx.png` `20_password_hwp.png` |
| 앱 아이콘 (런처) | `21_launcher_icon.png` |
| TXT 리더 | `22_text_reader.png` |
| 리더 보기 설정 | `23_reader_settings.png` |
| 개행 제거 + 세피아 | `24_reader_join_sepia.png` |
| 리더 본문 검색 | `25_reader_search.png` |
| 책갈피 | `26_reader_bookmark.png` |
| 눈 보호(블루라이트 줄이기) | `27_reader_eye_comfort.png` |
| 홈 검색(본문 포함) | `28_library_search_body.png` |
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
    - 검증: 14개 경로/MIME 조합을 질의해 지원 확장자는 모두 연결, `.zip` `.pdf.zip` 등은 연결되지 않음을 확인. MIME이 `octet-stream`인 HWP를 실제로 열어 표시까지 확인. (당시에는 `.doc` `.ppt` `.hwpx`를 열 수 없어 제외했고, 아래 18번에서 지원하면서 등록을 추가했다.)
16. **릴리스 워크플로우가 서명 키를 못 찾음** (v1.1.0 첫 빌드 실패): `validateSigningRelease` 단계에서 `Keystore file .../android/app/release.jks not found`. 워크플로우가 키를 `android/release.jks`에 썼는데 `app/build.gradle.kts`의 `storeFile`은 `android/app` 기준이다. 서명 시크릿을 처음 쓰는 이번에야 드러난 기존 버그였고, 키를 `android/app/`에 쓰도록 수정.
17. **자동 업데이트 실측 검증**: 새 키로 서명한 1.0.3을 에뮬레이터에 설치 → 앱 시작 시 새 버전 안내(릴리스 노트 표시, `14_update_dialog.png`) → 다운로드 → 시스템 "Do you want to update this app?" → 1.1.0(versionCode 4) 덮어쓰기 설치 성공, 재실행 후 안내가 다시 뜨지 않음. 릴리스 APK 서명(SHA-256)이 로컬 키와 일치함도 `apksigner`로 확인.
    - 이전에 v1.0.1·v1.0.2가 Pre-release였던 이유: 서명 시크릿이 없어 디버그 키로 올라갔고, 앱은 `releases/latest`(정식 릴리스)만 조회하므로 업데이트에 잡히지 않았다.

18. **비밀번호가 걸린 문서를 열 수 없음 → 포맷별로 해결** (기준선: PDF는 `PdfException: No password supplied` 원문 예외 화면, DOCX는 `jszip` 오류만 표시)
    - PDF: pdfrx의 `passwordProvider`에 비밀번호 대화상자를 연결. 틀리면 pdfrx가 다시 호출하므로 "맞지 않습니다" 안내와 함께 반복, 취소하면 친절한 오류 화면과 "비밀번호 입력" 버튼.
    - DOCX/XLSX/PPTX: 암호가 걸린 Office 문서는 zip이 아니라 OLE 컨테이너 안의 `EncryptedPackage`다. [MS-OFFCRYPTO] Agile 방식(SHA-512 10만 회 반복 → AES-CBC)을 `assets/web/office-crypto.js`에 직접 구현(WebCrypto, 외부 라이브러리 없음). `msoffcrypto-tool`로 만든 암호 파일을 복호화해 **원본과 바이트 단위로 일치**함을 Node에서 확인하고, 틀린 비밀번호는 검증 해시로 구분.
    - WebCrypto의 AES-CBC는 PKCS7 패딩을 강제하므로 "패딩 블록을 덧붙여 복호화" 하는 방식으로 패딩 없는 CBC를 흉내 냈다(`aesCbcDecrypt`).
    - HWP: 암호 알고리즘이 공개 규격에 없어 불가능하다고 판단했으나, rhwp가 `HwpDocument.openWithPassword`로 HWP5 암호와 암호 HWPX를 지원했다. 처음에는 "암호 문서는 지원하지 않는다"는 안내만 넣었다가 이를 발견하고 비밀번호 입력으로 교체. 테스트 파일은 rhwp의 `exportHwpWithPassword`로 실제 HWP 샘플을 암호화해 만들었다.
    - 구형 `.doc`/`.ppt`: 라이브러리가 복호화를 지원하지 않아 이유를 안내한다. `.ppt`는 `Current User` 스트림의 `headerToken`(오프셋 12)이 `0xF3D1C4DF`이면 암호 문서다. 처음 오프셋을 4로 잘못 읽어 암호 `.ppt`가 "슬라이드 0개"로 조용히 끝났고, 테스트 파일로 발견해 고쳤다.
19. **`.hwpx`가 파일 선택기에 보이지 않음**: 선택기에 확장자 필터를 주면 안드로이드가 MIME을 모르는 형식(`.hwpx`)을 목록에서 숨긴다. 필터를 없애고(`FileType.any`) 열 수 없는 형식은 뷰어가 안내하도록 바꿨다.
20. **구형 `.doc` / `.ppt` / `.hwpx` 지원**: 조사한 결과 `.ppt`용 라이브러리 중 가장 완성도 높은 `@file-viewer/ppt`는 워터마크가 붙는 독점 라이선스(+폰트 16MB)라 제외했다. 라이선스가 맞는 후보를 골라 사용했다.
    - `.hwpx`: `@rhwp/core`(MIT, Rust/WASM, 11.8MB). 화면에 보이는 페이지만 SVG로 그리고(`IntersectionObserver`) 멀어지면 비워 메모리를 아낀다. `measureTextWidth` 전역 함수를 등록해야 한다.
    - `.doc`: `@file-viewer/doc`(MIT). 표·이미지가 화면보다 넓어 본문 전체에 `zoom`을 걸고, 문서가 지정한 글꼴이 없어 고정폭으로 떨어지는 문제는 기본 글꼴로 통일해 해결.
    - `.ppt`: 공개 라이선스 렌더러가 없어 `ppt-text.js`로 슬라이드 텍스트만 직접 추출한다. 텍스트가 두 곳(`SlideListWithText`의 플레이스홀더, 각 `Slide`의 `ClientTextbox`)에 나뉘어 있어 둘을 슬라이드 순서로 합친다. Word·PowerPoint COM으로 만든 실제 `.doc`/`.ppt`로 검증.
    - HWP 일반 문서는 검증된 hwp.js를 그대로 쓰고, 암호 문서이거나 hwp.js가 못 여는 문서만 rhwp로 보낸다.
21. **앱 아이콘**: 런처에 기본 Flutter 로고가 그대로 나오고 있었다. 사용자 제안으로 홈 화면의 아이콘(`Icons.document_scanner_outlined`, 컨테이너 `#D7E2FF` · 글리프 `#294677`)을 그대로 앱 아이콘으로 썼다. Flutter에 포함된 Material 아이콘 폰트에서 글리프를 렌더링해 적응형 아이콘(API 26+)·테마 아이콘(API 33+)·일반 아이콘(API 24~25)을 만든다(`tool/make_icon.py`). 에뮬레이터 런처에서 확인(`21_launcher_icon.png`).
22. **TXT 리더 설계**: 문서 뷰어 제안(글자 모양·넘김 방식·책갈피·검색·눈 보호)을 한 번에 만족시키려고 WebView 대신 네이티브 리더를 만들었다.
    - 책갈피·검색·진행률 이동·"한 화면씩 넘기기"가 모두 **정확한 픽셀 위치**를 필요로 한다. 그래서 문단마다 높이를 `TextPainter`로 미리 재 두고 `ListView.itemExtentBuilder`에 넘겨, 어느 문단으로든 O(1)로 이동한다.
    - 미리 잰 높이와 실제로 그려진 높이가 어긋나지 않도록 `StrutStyle(forceStrutHeight: true)`로 줄 높이를 고정하고, 측정과 그리기에 같은 스타일(`inherit: false`)·`TextScaler.noScaling`을 쓴다.
    - 측정은 200문단마다 UI에 양보하며 진행률을 보여준다. 127만 자(3.2MB) 파일이 에뮬레이터에서 약 6초 안에 읽을 수 있는 상태가 되고 메모리는 약 140MB다.
    - 책갈피·읽던 위치는 문단 번호가 아니라 **원문 기준 글자 위치**로 저장한다. 글자 크기나 개행 제거로 문단이 바뀌어도 이진 탐색으로 같은 자리를 찾는다.
23. **한국어 TXT가 깨짐(CP949)**: 기존 TXT 렌더러는 UTF-8로만 읽어서 EUC-KR/CP949 파일이 깨졌다. Dart에는 한국어 코덱이 없고 `enough_convert`에도 없어서, Python의 `cp949` 코덱으로 변환표(`assets/cp949.bin`, 47KB)를 생성해(`tool/make_cp949.py`) 직접 디코더를 만들었다. BOM → 엄격한 UTF-8 → CP949 순으로 판별한다.
24. **눈 보호를 켜면 읽던 위치가 맨 앞으로 돌아감**: 필터(`ColorFiltered`)가 위젯 트리에 새로 끼어들면서 목록이 재생성돼 스크롤 위치가 초기화됐다. 에뮬레이터에서 11% 지점에서 켰더니 문서 처음 내용이 나와 발견. 본문에 `GlobalKey`를 줘서 상태가 유지되도록 했고, 켜고 끄기를 반복해도 같은 자리에 있음을 확인.
25. **스크롤된 글자가 상태 표시줄 시계 뒤로 겹침**: 목록 영역을 상태 표시줄 아래에서 시작하게 하고 위쪽 여백은 고정했다.
26. **파일 선택기에서 새 파일이 안 보이는 테스트 환경 문제**: `adb push`로 올린 `.txt`는 MediaStore에 색인되지 않아 선택기·`content://` 인텐트로 열 수 없었다. `MEDIA_SCANNER_SCAN_FILE` 브로드캐스트로 색인한 뒤 점검했다.

배운 점: WebView + `file://` 조합은 `fetch()`가 막혀 로컬 서버가 필요하다. 그 서버를 안전하게 쓰려면 바인딩 주소(루프백), 토큰, 경로 허용 목록, 플랫폼별 평문 HTTP 정책을 함께 맞춰야 한다.

## 향후 계획 / TODO

코드에서 확인된 한계 기준이다.

- [ ] 마크다운 링크 동작·이미지 표시 (현재는 텍스트만)
- [ ] TXT 리더: 화면 켜짐 유지, 글꼴 번들(나눔명조 등 — 지금은 기기 내장 글꼴), 탭 영역 크기 조절, 책갈피 이름 편집
- [ ] TXT 리더: 개행 제거 정확도(대화체·시·목록처럼 줄 구분이 의미 있는 글은 끄고 읽어야 함)
- [ ] 홈 검색을 "최근 문서"가 아닌 기기 전체 폴더로 확대 (저장소 접근 권한 필요)
- [ ] TXT 외 형식(PDF·DOCX 등)의 본문 검색 — 현재 홈 검색의 본문 포함은 TXT·LOG·MD·CSV만- [ ] 실기기(저사양)에서 HWP 대용량 문서 메모리 확인 — 현재 수치는 에뮬레이터 기준
- [ ] 구형 `.ppt`의 도형·이미지 표시 (현재는 텍스트만 추출)
- [ ] 암호가 걸린 구형 `.doc` / `.ppt` / `.xls`(RC4)와 Office 2007 방식(Standard) 암호 지원 (현재는 안내만)
- [ ] 비밀번호 확인 속도 (DOCX 등은 SHA-512 10만 회 반복이라 에뮬레이터 기준 약 8초)
- [ ] HWPX 대용량 문서의 메모리 (스크롤 중 일시적으로 약 500MB, 안정 시 약 355MB — 에뮬레이터 기준)
- [ ] HEIC: 확장자 목록에는 있으나 `webKind` 매핑이 없어 실제로는 열리지 않음 → 지원하거나 목록에서 제거
- [ ] 최근 문서 목록 영구 저장 (현재 `_recent`는 메모리 전용이라 앱 재시작 시 사라짐)
- [ ] 엑셀 200행 × 80열 제한 완화 (가상 스크롤 등)
- [ ] PPTX 복잡한 차트 정확도 개선
- [ ] iOS 배포 빌드 (macOS + TestFlight)
- [ ] 서명 키 폴더를 PC 밖(클라우드 등)에도 백업

## 기획 단계 (미작성)

자료조사용 최초 질문과 개발 착수 시 Claude에게 준 요청 프롬프트는 저장소에 남아 있지 않아 작성하지 못했습니다. 원문을 주시면 이 위치에 그대로 인용해 넣겠습니다.
