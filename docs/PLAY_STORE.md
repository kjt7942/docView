# Google Play 출시 준비

## 빌드
GitHub → Actions → **Play bundle (AAB)** → Run workflow.
`STORE_BUILD=true`로 빌드되어 `REQUEST_INSTALL_PACKAGES` 권한과 자체 업데이트가 빠집니다(Play 정책).
서명 시크릿(`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)이 없으면 디버그 키로 서명되므로 업로드할 수 없습니다.
Play App Signing을 쓰는 경우 업로드 키로 서명하면 됩니다. 패키지명은 `com.docviewer`입니다(이미 사용 중이면 `android/app/build.gradle.kts`의 `applicationId`를 바꾸세요).

## 스토어 등록정보 초안
- **앱 이름**: 문서 뷰어 — PDF·워드·엑셀·PPT·한글
- **간단한 설명(80자)**: 광고 없이 PDF·Word·Excel·PPT·한글(HWP) 문서를 열어 보는 가벼운 뷰어
- **자세한 설명**:
  광고 없이 문서를 열어 보는 뷰어입니다. 파일은 기기 밖으로 나가지 않습니다.
  · PDF, Word(doc/docx), Excel(xls/xlsx/csv), PowerPoint(ppt/pptx), 한글(hwp/hwpx), 텍스트, 마크다운, 이미지 지원
  · 엑셀 서식·도형·차트 표시, 시트 탭 하단 이동
  · 암호가 걸린 문서 열기
  · TXT 전용 리더: 한글 인코딩(CP949) 자동 판별, 글꼴·줄간격·테마, 책갈피, 본문 검색, 이어 읽기, 눈 보호 모드
  · 파일 관리자·메신저·메일에서 "연결 프로그램"으로 바로 열기
  · 편집 기능은 없습니다(보기 전용).
- **카테고리**: 도구 또는 비즈니스 / **콘텐츠 등급**: 전체 이용가

## 데이터 보안 양식 답변
- 수집하는 데이터: **없음** / 제3자와 공유: **없음**
- 전송 중 암호화: 해당 없음(외부 전송 없음) / 데이터 삭제 요청: 해당 없음(서버에 저장하지 않음)
- 개인정보처리방침 URL: `docs/PRIVACY.md`를 GitHub Pages 등으로 공개한 주소

## 필요한 이미지(직접 준비)
앱 아이콘 512×512, 대표 이미지 1024×500, 휴대전화 스크린샷 2장 이상.
