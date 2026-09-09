#!/usr/bin/env node
/**
 * 문서 드리프트 검사 — 역반영이 실제로 됐는지 기계가 판정한다.
 *
 * CLAUDE.md §9 의 규칙은 글이라 지켜질 확률만 올린다. 이 파일이 그것을 강제한다.
 * 하나라도 걸리면 종료 코드 1 이며, 그 상태로 작업을 '완료'라고 부르지 않는다.
 *
 * 검사하는 것
 *   1) 요구 ID 집합이 RFP → PRD → SRS → SDD 에서 일치하는가
 *   2) 각 문서 헤더의 '기준 문서' 버전이 상위 문서의 실제 버전과 같은가
 *   3) ADR 행에 빈 칸이나 "없음" 대안이 없는가
 *   4) 코드 주석이 인용한 요구 번호가 SRS 에 실재하는가
 *   5) SRS 의 시험 유형 요구가 TC 문서에 하나라도 걸려 있는가
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');
const problems = [];
const notes = [];

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

/** 요구 표의 왼쪽 칸에서 태어난 ID 만 센다. 본문 인용은 세지 않는다. */
function definedIds(text) {
  const out = new Set();
  for (const m of text.matchAll(/^\|\s*`((?:FR|NFR)-[A-Z]+-\d+)`\s*\|/gm)) out.add(m[1]);
  return out;
}
/** 어디서든 언급된 ID (추적표 등) */
function mentionedIds(text) {
  const out = new Set();
  for (const m of text.matchAll(/\b((?:FR|NFR)-[A-Z]+-\d+)\b/g)) out.add(m[1]);
  return out;
}
function docVersion(text) {
  const m = /^\|\s*버전\s*\|\s*([0-9.]+)\s*\|/m.exec(text);
  return m ? m[1] : null;
}
function baselineRefs(text) {
  // "| 기준 문서 | [RFP.md](../rfp/RFP.md) v0.7 · [PRD.md](../prd/PRD.md) v0.8 ... |"
  const line = /^\|\s*기준 문서\s*\|(.+)\|\s*$/m.exec(text);
  if (!line) return [];
  return [...line[1].matchAll(/\[([A-Z]+)\.md\]\([^)]*\)\s*v([0-9.]+)/g)].map((m) => ({
    doc: m[1],
    version: m[2],
  }));
}
function sectionOf(text, headingRe, nextRe) {
  const s = text.search(headingRe);
  if (s === -1) return '';
  const rest = text.slice(s);
  const e = rest.slice(1).search(nextRe);
  return e === -1 ? rest : rest.slice(0, e + 1);
}

// ── 문서 읽기 ──────────────────────────────────────────────────────────────
const files = ['MRD', 'RFP', 'PRD', 'SRS', 'SDD'];
/** 시험 기준서도 상위 버전을 인용한다. 같이 검사한다. */
const extraFiles = [
  ['TC_ENTRY', path.join(DOCS, 'tc', 'TC_ENTRY.md')],
  ['TC_CAT', path.join(DOCS, 'tc', 'TC_CAT.md')],
  ['TC_VIEW', path.join(DOCS, 'tc', 'TC_VIEW.md')],
];
const doc = {};
for (const f of files) {
  const p = path.join(DOCS, f.toLowerCase(), `${f}.md`);
  if (!exists(p)) {
    problems.push(`docs/${f.toLowerCase()}/${f}.md 가 없다`);
    continue;
  }
  doc[f] = read(p);
}
if (problems.length) finish();

// ── 1) 요구 ID 집합 정합 ───────────────────────────────────────────────────
const rfpIds = definedIds(doc.RFP);
const srsIds = definedIds(doc.SRS);

const onlyRfp = [...rfpIds].filter((id) => !srsIds.has(id));
const onlySrs = [...srsIds].filter((id) => !rfpIds.has(id));
if (onlyRfp.length) problems.push(`RFP 에만 있고 SRS 가 정련하지 않은 요구: ${onlyRfp.join(', ')}`);
if (onlySrs.length) problems.push(`SRS 가 새로 만든 요구(금지): ${onlySrs.join(', ')}`);

const prdTrace = mentionedIds(
  sectionOf(doc.PRD, /^## 8\. RFP 추적성/m, /^## 9\./m) || doc.PRD,
);
const missingPrd = [...rfpIds].filter((id) => !prdTrace.has(id));
if (missingPrd.length) problems.push(`PRD 추적표에 없는 요구: ${missingPrd.join(', ')}`);

const sddTrace = mentionedIds(sectionOf(doc.SDD, /^## 4\. SRS 추적/m, /^## 5\./m));
const missingSdd = [...srsIds].filter((id) => !sddTrace.has(id));
if (missingSdd.length)
  problems.push(`SDD 가 어떤 설계로 실현하는지 밝히지 않은 요구: ${missingSdd.join(', ')}`);

notes.push(`요구 ID: RFP ${rfpIds.size} / SRS ${srsIds.size} / PRD 추적 ${prdTrace.size} / SDD 추적 ${sddTrace.size}`);

// ── 2) 기준 문서 버전 정합 ─────────────────────────────────────────────────
const versions = Object.fromEntries(files.map((f) => [f, docVersion(doc[f])]));
for (const [name, p] of extraFiles) {
  if (exists(p)) doc[name] = read(p);
}
for (const f of Object.keys(doc)) {
  for (const ref of baselineRefs(doc[f])) {
    const actual = versions[ref.doc];
    if (!actual) continue;
    if (actual !== ref.version) {
      problems.push(
        `${f} 는 ${ref.doc} v${ref.version} 을 기준으로 적혀 있는데 실제 ${ref.doc} 은 v${actual} 이다 (역반영 누락)`,
      );
    }
  }
}
notes.push(`문서 버전: ${files.map((f) => `${f} v${versions[f]}`).join(' · ')}`);

// ── 3) ADR 행 검사 ────────────────────────────────────────────────────────
let adrCount = 0;
for (const line of doc.SDD.split('\n')) {
  if (!/^\|\s*(~~)?`?ADR-\d+/.test(line)) continue;
  adrCount++;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 8) {
    problems.push(`ADR 행의 칸이 모자라다: ${cells[0]}`);
    continue;
  }
  const [id, , , alternatives, reason, , revert, status] = cells;
  if (!alternatives || alternatives === '없음' || alternatives === '-')
    problems.push(`${id}: 검토한 대안이 비어 있다 — 대안 없는 결정은 결정이 아니라 제약이다`);
  if (!reason) problems.push(`${id}: 선택 이유가 비어 있다`);
  if (!revert) problems.push(`${id}: 되돌릴 조건이 비어 있다 — 재검토 시점이 영원히 오지 않는다`);
  if (!status) problems.push(`${id}: 상태가 비어 있다`);
}
notes.push(`ADR ${adrCount}행`);

// ── 4) 코드가 인용한 요구 번호가 실재하는가 ────────────────────────────────
const srcFiles = [];
(function walk(dir) {
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(e.name)) srcFiles.push(p);
  }
})(path.join(ROOT, 'src'));

const stale = new Map();
for (const file of srcFiles) {
  for (const m of read(file).matchAll(/\b((?:FR|NFR)-[A-Z]+-\d+)\b/g)) {
    if (!srsIds.has(m[1])) {
      const rel = path.relative(ROOT, file);
      if (!stale.has(m[1])) stale.set(m[1], new Set());
      stale.get(m[1]).add(rel);
    }
  }
}
for (const [id, where] of stale) {
  problems.push(`코드가 SRS 에 없는 요구를 인용한다: ${id} (${[...where].join(', ')})`);
}

// ── 5) 시험 유형 요구에 TC 가 있는가 ───────────────────────────────────────
const tcDir = path.join(DOCS, 'tc');
let tcText = '';
if (exists(tcDir)) {
  for (const f of fs.readdirSync(tcDir).filter((f) => /^TC_[A-Z]+\.md$/.test(f))) {
    tcText += read(path.join(tcDir, f));
  }
} else {
  problems.push('docs/tc/ 가 없다 — 시험 기준서 없이 검증을 말할 수 없다');
}
const tcMentioned = mentionedIds(tcText);
const testType = [];
for (const line of doc.SRS.split('\n')) {
  const m = /^\|\s*`((?:FR|NFR)-[A-Z]+-\d+)`\s*\|/.exec(line);
  if (!m) continue;
  if (/\|\s*시험\s*\|/.test(line)) testType.push(m[1]);
}
const noTc = testType.filter((id) => !tcMentioned.has(id));
if (noTc.length) problems.push(`시험 유형인데 TC 문서에 없는 요구: ${noTc.join(', ')}`);
notes.push(`시험 유형 요구 ${testType.length}개 / TC 문서가 다루는 것 ${testType.length - noTc.length}개`);

finish();

function finish() {
  console.log('');
  for (const n of notes) console.log(`  ${n}`);
  console.log('');
  if (problems.length === 0) {
    console.log('문서 드리프트 없음 — 역반영이 되어 있다.');
    process.exit(0);
  }
  console.log(`역반영이 덜 됐다. ${problems.length}건:`);
  for (const p of problems) console.log(`  · ${p}`);
  console.log('');
  console.log('고치기 전까지 이 작업을 완료라고 부르지 않는다. (.claude/CLAUDE.md §9)');
  process.exit(1);
}
