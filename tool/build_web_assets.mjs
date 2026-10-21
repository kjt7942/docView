// assets/web/vendor 의 JS 번들을 재생성한다.
//
//   node tool/build_web_assets.mjs
//
// 네트워크가 필요하며, 결과물은 저장소에 커밋한다(앱은 완전 오프라인으로 동작).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VENDOR = path.join(ROOT, 'assets', 'web', 'vendor');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'docviewer-web-'));

const PACKAGES = [
  'pptx-browser@4.1.5',
  'hwp.js@0.0.3',
  '@rhwp/core@0.8.7',
  '@file-viewer/doc@3.2.2',
  'docx-preview@0.4.1',
  'jszip@3.10.1',
  'xlsx@0.18.5',
  'esbuild@0.25.0',
];

function run(command, args, cwd = WORK) {
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

console.log(`[1/4] 작업 디렉터리: ${WORK}`);
fs.writeFileSync(
  path.join(WORK, 'package.json'),
  JSON.stringify({ name: 'docviewer-web-assets', private: true }, null, 2),
);
run('npm', ['install', '--no-audit', '--no-fund', ...PACKAGES]);

// pptx-browser 4.1.5는 renderTextBody에서 defRPr를 선언 전에 참조한다(TDZ).
// 번들 후 ReferenceError가 나므로 소스를 패치한 뒤 번들링한다.
console.log('[2/4] pptx-browser TDZ 패치');
const renderPath = path.join(WORK, 'node_modules', 'pptx-browser', 'src', 'render.js');
let render = fs.readFileSync(renderPath, 'utf8');
const bulletLine = [
  '    // ── Bullet / list marker ─────────────────────────────────────────────────',
  "    const bullet = pPr ? parseBullet(pPr, defRPr, themeColors, themeData) : null;",
].join('\n');
if (!render.includes(bulletLine)) {
  throw new Error('pptx-browser render.js 패치 지점을 찾지 못했습니다(버전 변경 확인).');
}
render = render.replace(
  bulletLine,
  `    const defRPr = g1(pPr, 'defRPr');\n\n${bulletLine}`,
);
render = render.replace(
  "    const lnSpc = g1(pPr, 'lnSpc');\n    const defRPr = g1(pPr, 'defRPr');",
  "    const lnSpc = g1(pPr, 'lnSpc');",
);
fs.writeFileSync(renderPath, render);

// g1()은 자손 전체를 탐색한다. 도형의 채우기를 찾을 때 noFill을 먼저 찾으면
// <a:ln><a:noFill/></a:ln>(윤곽선 없음)을 도형 채우기로 오인해, "윤곽선 없음 + 단색 채우기"
// 도형(레이아웃 배경 사각형 등)과 표 셀 배경이 그려지지 않는다. 직계 자식에서만 찾도록 고친다.
console.log('[2/4] pptx-browser 채우기 탐색 패치');
const fillLoop = [
  '    for (const fn of fillNames) {',
  '      const el = g1(spPr, fn);',
  '      if (el) return el;',
  '    }',
].join('\n');
const cellFill =
  "const fillEl = tcPr ? (['noFill','solidFill','gradFill','blipFill','pattFill'].map(n=>g1(tcPr,n)).find(Boolean)) : null;";
if (!render.includes(fillLoop) || !render.includes(cellFill)) {
  throw new Error('pptx-browser 채우기 패치 지점을 찾지 못했습니다(버전 변경 확인).');
}
render = render
  .replace(
    fillLoop,
    [
      '    for (const child of spPr ? spPr.children : []) {',
      '      if (fillNames.includes(child.localName)) return child;',
      '    }',
    ].join('\n'),
  )
  .replace(
    cellFill,
    "const fillEl = tcPr ? ([...tcPr.children].find((c) => ['noFill','solidFill','gradFill','blipFill','pattFill'].includes(c.localName)) ?? null) : null;",
  );
fs.writeFileSync(renderPath, render);

// getRunColorInherited()는 이미 CSS 문자열("rgb(r,g,b)")을 돌려주는데, 그리는 쪽이 그 문자열을
// colorToCss()에 한 번 더 넣어 "rgb(undefined,...)"가 된다. 캔버스가 이 값을 무시해서
// 색이 지정된 글자가 직전에 쓰던 색(흰색 등)으로 그려진다. 문자열이면 그대로 쓴다.
console.log('[2/4] pptx-browser 글자색 이중 변환 패치');
const runColor = "        ctx.fillStyle = c ? colorToCss(c) : '#000000';";
if (!render.includes(runColor)) {
  throw new Error('pptx-browser 글자색 패치 지점을 찾지 못했습니다(버전 변경 확인).');
}
render = render.replace(
  runColor,
  "        ctx.fillStyle = c ? (typeof c === 'string' ? c : colorToCss(c)) : '#000000';",
);
fs.writeFileSync(renderPath, render);

// @file-viewer/doc 3.2.2 의 표 복원(normalizeRowEndOnlyTables)은 앞 행과 "표 모양이 같은지"를
// 첫 열 왼쪽/마지막 열 오른쪽 경계만으로 비교한다. 열 구성이 다른 두 표의 전체 폭이 같으면
// 같은 표로 착각해, 두 표 사이의 본문 전체가 표 셀 안으로 빨려 들어가 글자가 한 줄에 한 글자씩
// 보이게 된다. 모든 열 경계를 함께 비교하도록 고친다.
console.log('[2/4] @file-viewer/doc 표 구분 패치');
const docParserPath = path.join(WORK, 'node_modules', '@file-viewer', 'doc', 'dist', 'msdoc', 'parser.js');
let docParser = fs.readFileSync(docParserPath, 'utf8');
const sigAnchor = "        cells[cells.length - 1]?.rightBoundary ?? '',";
if (!docParser.includes(sigAnchor)) {
  throw new Error('@file-viewer/doc 표 패치 지점을 찾지 못했습니다(버전 변경 확인).');
}
docParser = docParser.replace(
  sigAnchor,
  sigAnchor + "\n        cells.map((cell) => cell.rightBoundary ?? '').join(','),",
);
fs.writeFileSync(docParserPath, docParser);

// hwp.js 0.0.3 splitTable은 첫 행이 한 페이지보다 높으면 같은 표로 무한 재귀한다
// ("Maximum call stack size exceeded"). 새 페이지에서도 안 들어가는 첫 행은 강제로
// 넣어 진행시키고, 이때는 셀 분할(overflow)을 건너뛴다.
console.log('[2/4] hwp.js splitTable 무한 재귀 패치');
const hwpPath = path.join(WORK, 'node_modules', 'hwp.js', 'build', 'esm.js');
let hwp = fs.readFileSync(hwpPath, 'utf8');
const splitElse = [
  '    } else {',
  '      splitRowIndex = i;',
  '      break;',
  '    }',
].join('\n');
const splitOverflow = '      if (column.attribute.height > targetHeight) {';
if (!hwp.includes(splitElse) || !hwp.includes(splitOverflow)) {
  throw new Error('hwp.js splitTable 패치 지점을 찾지 못했습니다(버전 변경 확인).');
}
hwp = hwp
  .replace(
    splitElse,
    [
      '    } else {',
      '      if (i === 0 && targetHeight >= contentHeight) {',
      '        forced = true;',
      '        columns.push(row);',
      '        if (table.length > 1) splitRowIndex = 1;',
      '      } else {',
      '        splitRowIndex = i;',
      '      }',
      '      break;',
      '    }',
    ].join('\n'),
  )
  .replace('  var columns = [];\n  var rowHeights = [];', '  var columns = [];\n  var rowHeights = [];\n  var forced = false;')
  .replace(splitOverflow, '      if (!forced && column.attribute.height > targetHeight) {');
fs.writeFileSync(hwpPath, hwp);

// hwp.js의 ESM 빌드는 Node의 fs를 import한다. 브라우저 번들에서는 빈 shim으로 대체한다.
fs.writeFileSync(
  path.join(WORK, 'fs-shim.js'),
  "module.exports = { createReadStream() { throw new Error('fs is not available in the browser'); } };\n",
);

console.log('[3/4] esbuild 번들링');
const esbuild = path.join(WORK, 'node_modules', '.bin', 'esbuild');
// 엑셀 도형(drawing)을 그릴 때 PPT 렌더러의 하위 함수를 그대로 재사용하기 위해
// index.js 외에 몇 가지를 추가로 내보내는 진입점을 만든다.
fs.writeFileSync(
  path.join(WORK, 'pptx-entry.js'),
  [
    "export * from './node_modules/pptx-browser/src/index.js';",
    "export { renderSpTree, getRels, loadImages } from './node_modules/pptx-browser/src/render.js';",
    "export { parseTheme, buildThemeColors } from './node_modules/pptx-browser/src/theme.js';",
    "export { parseXml } from './node_modules/pptx-browser/src/utils.js';",
    '',
  ].join('\n'),
);
run(esbuild, [
  'pptx-entry.js',
  '--bundle',
  '--format=iife',
  '--global-name=PptxBrowser',
  '--outfile=out/pptx-browser.js',
]);
run(esbuild, [
  'node_modules/hwp.js/build/esm.js',
  '--bundle',
  '--format=iife',
  '--global-name=HwpJs',
  '--alias:fs=./fs-shim.js',
  '--minify',
  '--outfile=out/hwp.min.js',
]);

// rhwp(Rust/WASM): HWPX와 암호가 걸린 HWP/HWPX. 번들은 IIFE 전역 Rhwp(기본 export = init)로 노출한다.
run(esbuild, [
  'node_modules/@rhwp/core/rhwp.js',
  '--bundle',
  '--format=iife',
  '--global-name=Rhwp',
  '--minify',
  '--outfile=out/rhwp.min.js',
]);
// 구형 .doc(MS-DOC 바이너리) 파서/HTML 렌더러. 전역 MsDoc(parseMsDoc, renderMsDoc).
run(esbuild, [
  'node_modules/@file-viewer/doc/dist/index.js',
  '--bundle',
  '--format=iife',
  '--global-name=MsDoc',
  '--minify',
  '--outfile=out/msdoc.min.js',
]);

console.log('[4/4] vendor 복사');
fs.copyFileSync(path.join(WORK, 'out', 'rhwp.min.js'), path.join(VENDOR, 'rhwp.min.js'));
fs.copyFileSync(path.join(WORK, 'node_modules', '@rhwp', 'core', 'rhwp_bg.wasm'), path.join(VENDOR, 'rhwp_bg.wasm'));
fs.copyFileSync(path.join(WORK, 'out', 'msdoc.min.js'), path.join(VENDOR, 'msdoc.min.js'));
// 서드파티 라이선스 동봉
const LICENSES = path.join(ROOT, 'assets', 'third_party_licenses');
fs.copyFileSync(path.join(WORK, 'node_modules', '@rhwp', 'core', 'LICENSE'), path.join(LICENSES, 'rhwp.txt'));
fs.copyFileSync(path.join(WORK, 'node_modules', '@file-viewer', 'doc', 'LICENSE'), path.join(LICENSES, 'file-viewer-doc.txt'));
fs.mkdirSync(VENDOR, { recursive: true });
fs.copyFileSync(path.join(WORK, 'out', 'pptx-browser.js'), path.join(VENDOR, 'pptx-browser.js'));
fs.copyFileSync(path.join(WORK, 'out', 'hwp.min.js'), path.join(VENDOR, 'hwp.min.js'));
fs.copyFileSync(
  path.join(WORK, 'node_modules', 'docx-preview', 'dist', 'docx-preview.min.js'),
  path.join(VENDOR, 'docx-preview.min.js'),
);
fs.copyFileSync(
  path.join(WORK, 'node_modules', 'jszip', 'dist', 'jszip.min.js'),
  path.join(VENDOR, 'jszip.min.js'),
);
fs.copyFileSync(
  path.join(WORK, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'),
  path.join(VENDOR, 'xlsx.full.min.js'),
);

console.log('완료:', fs.readdirSync(VENDOR).join(', '));
