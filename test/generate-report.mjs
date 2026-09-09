#!/usr/bin/env node
/**
 * TC 문서와 테스트 태그를 집합 비교하는 리포트 생성기.
 * spec_guide §6 의 계약 세 줄을 지킨다.
 *   ① 테스트에 TC-ID 를 태깅한다 (테스트 이름의 [TC-<COMP>-NN])
 *   ② 실행 산출물에 그 ID 가 기계 판독 가능하게 남는다 (vitest json)
 *   ③ 리포트가 TC 문서와 집합 비교해 orphan·미커버를 낸다
 *
 * 종료 코드: orphan 이 있으면 1, 아니면 vitest 의 종료 코드. ← CI 게이트
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'test', '.out');
const JSON_PATH = path.join(OUT_DIR, 'vitest.json');
const REPORT_PATH = path.join(OUT_DIR, 'tc-report.md');
const TC_DIR = path.join(ROOT, 'docs', 'tc');

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── ① 테스트 실행 ──────────────────────────────────────────────────────────
// npx 는 Windows 에서 execFileSync 와 잘 맞지 않는다. vitest 진입점을 node 로 직접 부른다.
const VITEST_BIN = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
let vitestExit = 0;
try {
  execFileSync(process.execPath, [VITEST_BIN, 'run', '--reporter=json', `--outputFile=${JSON_PATH}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch (e) {
  vitestExit = typeof e.status === 'number' ? e.status : 1;
}

if (!fs.existsSync(JSON_PATH)) {
  console.error('시험 결과 파일이 없다. 리포트를 만들 수 없다.');
  process.exit(vitestExit || 1);
}

// ── ② 태그 수집 ────────────────────────────────────────────────────────────
const result = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const TAG_RE = /\[(TC-[A-Z]+-\d+)\]/g;

/** TC-ID → { pass, fail, skip, tests: [] } */
const tagged = new Map();
let totals = { pass: 0, fail: 0, skip: 0 };

for (const suite of result.testResults ?? []) {
  for (const t of suite.assertionResults ?? []) {
    const name = `${(t.ancestorTitles ?? []).join(' > ')} > ${t.title}`;
    const status = t.status === 'passed' ? 'pass' : t.status === 'failed' ? 'fail' : 'skip';
    totals[status]++;
    TAG_RE.lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(t.title ?? '')) !== null) {
      const id = m[1];
      if (!tagged.has(id)) tagged.set(id, { pass: 0, fail: 0, skip: 0, tests: [] });
      const e = tagged.get(id);
      e[status]++;
      e.tests.push(name);
    }
  }
}

// ── ③ 문서 정의 수집 ───────────────────────────────────────────────────────
// 파일명 접두와 일치하는 컴포넌트 ID 만 취해 교차 인용을 배제한다.
const defined = new Map(); // TC-ID → 파일명
if (fs.existsSync(TC_DIR)) {
  for (const file of fs.readdirSync(TC_DIR).filter((f) => /^TC_[A-Z]+\.md$/.test(f))) {
    const comp = file.slice(3, -3); // TC_ENTRY.md → ENTRY
    const text = fs.readFileSync(path.join(TC_DIR, file), 'utf8');
    const re = new RegExp(`TC-${comp}-(\\d+)`, 'g');
    let m;
    while ((m = re.exec(text)) !== null) defined.set(`TC-${comp}-${m[1]}`, file);
  }
}

const definedIds = new Set(defined.keys());
const taggedIds = new Set(tagged.keys());
const orphan = [...taggedIds].filter((id) => !definedIds.has(id)).sort();
const uncovered = [...definedIds].filter((id) => !taggedIds.has(id)).sort();

// ── 리포트 ────────────────────────────────────────────────────────────────
const failing = [...tagged.entries()].filter(([, v]) => v.fail > 0);
const lines = [];
lines.push('# TC 대조 리포트');
lines.push('');
lines.push(`생성: ${new Date().toISOString()}`);
lines.push('');
lines.push('| 항목 | 값 |');
lines.push('|---|---|');
lines.push(`| 시험 통과 | ${totals.pass} |`);
lines.push(`| 시험 실패 | ${totals.fail} |`);
lines.push(`| 시험 건너뜀 | ${totals.skip} |`);
lines.push(`| 문서가 정의한 TC | ${definedIds.size} |`);
lines.push(`| 테스트가 태깅한 TC | ${taggedIds.size} |`);
lines.push(`| **orphan**(문서에 없는 태그) | **${orphan.length}** |`);
lines.push(`| 미커버(테스트 없는 TC) | ${uncovered.length} |`);
lines.push('');

if (orphan.length) {
  lines.push('## orphan — 커밋 전 0 이어야 한다');
  lines.push('');
  for (const id of orphan) lines.push(`- \`${id}\` — 문서에 없는 TC 를 테스트가 주장한다(오타 또는 드리프트)`);
  lines.push('');
}

if (uncovered.length) {
  lines.push('## 미커버 — 실패가 아니라 "자동화 미연결"');
  lines.push('');
  lines.push('| TC | 문서 |');
  lines.push('|---|---|');
  for (const id of uncovered) lines.push(`| \`${id}\` | ${defined.get(id)} |`);
  lines.push('');
}

if (failing.length) {
  lines.push('## 실패한 TC');
  lines.push('');
  for (const [id, v] of failing) lines.push(`- \`${id}\` — 실패 ${v.fail}건`);
  lines.push('');
}

lines.push('## 커버된 TC');
lines.push('');
lines.push('| TC | 통과 | 실패 |');
lines.push('|---|---|---|');
for (const id of [...taggedIds].sort()) {
  const v = tagged.get(id);
  lines.push(`| \`${id}\` | ${v.pass} | ${v.fail} |`);
}
lines.push('');

fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');

console.log('');
console.log(`시험 ${totals.pass} passed / ${totals.fail} failed / ${totals.skip} skipped`);
console.log(`문서 TC ${definedIds.size} / 태깅 ${taggedIds.size} / orphan ${orphan.length} / 미커버 ${uncovered.length}`);
if (orphan.length) console.log(`orphan: ${orphan.join(', ')}`);
console.log(`리포트: ${path.relative(ROOT, REPORT_PATH)}`);

process.exit(orphan.length > 0 ? 1 : vitestExit);
