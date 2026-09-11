/**
 * 밖으로 나가는 것 — FR-ENTRY-15 / FR-ENTRY-16 / FR-ENTRY-18.
 *
 * SRS S-05 의 결정대로 **두 지점 모두**에서 판정한다.
 *  ① 구조: 해석 경계 밖에 외부 호출 지점이 있는지 소스를 훑는다.
 *  ② 실행: 시험 중 나가는 요청을 가로채 해석 요청 외의 건수를 센다.
 * ①만으로는 우회 경로를, ②만으로는 시험이 밟지 않은 경로를 놓친다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { freshDb, cleanup, categoryIdByName, TODAY, type TestEnv } from './helpers';
import { createRecord, queryRecords, totalsInRange, monthPresence } from '@/lib/repo/records';
import { exportBundle, exportCsv } from '@/lib/transfer';
import { currentOutboundFields } from '@/lib/interpret';
import { geminiProvider } from '@/lib/interpret/gemini';
import { IMAGE_ATTACH_NOTICE } from '@/lib/interpret/notices';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

/** src 아래의 모든 소스 파일 경로. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('해석 경계 — 나가는 것', () => {
  it('[TC-ENTRY-35] FR-ENTRY-15: 해석 외의 처리에서는 밖으로 나가는 요청이 없다', () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      throw new Error('이 시험에서는 나가면 안 된다');
    }) as unknown as typeof globalThis.fetch;

    try {
      const c = createRecord(
        {
          date: TODAY,
          amount: 8000,
          direction: 'expense',
          categoryId: categoryIdByName('식비', env.db),
          note: '점심',
        },
        env.db,
      );
      expect(c.ok).toBe(true);
      queryRecords({ from: TODAY, to: TODAY }, env.db);
      totalsInRange(TODAY, TODAY, env.db);
      monthPresence('2026-09', env.db);
      exportBundle({}, env.db);
      exportCsv(env.db);
    } finally {
      globalThis.fetch = original;
    }

    expect(calls).toEqual([]);
  });

  it('[TC-ENTRY-36] FR-ENTRY-15: 해석 경계 밖에 외부로 나가는 호출 지점이 없다', () => {
    const root = path.join(process.cwd(), 'src');
    const boundary = path.join(root, 'lib', 'interpret');
    const offenders: string[] = [];

    for (const file of sourceFiles(root)) {
      if (file.startsWith(boundary)) continue;
      const text = fs.readFileSync(file, 'utf8');
      // 주석은 뺀다 — 설명에 등장하는 낱말까지 위반으로 세면 검사가 무뎌진다.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      if (/\bfetch\s*\(/.test(code)) offenders.push(`${path.relative(root, file)}: fetch(`);
      if (/\bXMLHttpRequest\b/.test(code)) offenders.push(`${path.relative(root, file)}: XMLHttpRequest`);
      if (/from\s+['"]node:(https?|net|dgram)['"]/.test(code))
        offenders.push(`${path.relative(root, file)}: node network module`);
    }

    expect(offenders).toEqual([]);
  });

  it('[TC-ENTRY-37] FR-ENTRY-16: 외부 수단을 쓰지 않으면 나가는 항목이 없다', () => {
    const before = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      expect(currentOutboundFields()).toEqual([]);
    } finally {
      if (before !== undefined) process.env.GEMINI_API_KEY = before;
    }
  });

  it('[TC-ENTRY-38] FR-ENTRY-16: 외부 수단을 쓰면 나가는 항목 이름이 제시된다', () => {
    const keys = geminiProvider.outboundFields.map((f) => f.key);
    expect(keys).toContain('text');
    expect(keys).toContain('image');
    expect(keys).toContain('categories');
    for (const f of geminiProvider.outboundFields) {
      expect(f.label.length).toBeGreaterThan(0);
    }
  });

  it('[TC-ENTRY-40] FR-ENTRY-16: 나가는 항목 안내가 두 길(기록 입력·내역 검색)을 모두 말한다', () => {
    /*
     * 나가는 길이 하나 늘었는데(FR-VIEW-13) 안내가 그대로면 사용자가 보는 목록과
     * 실제가 어긋난다 — 코드를 늘리기 전에 문서를 고치라는 §8 이 지키려는 것이
     * 바로 이 어긋남이다. 여기서는 그 문구가 실제로 갱신됐는지를 값으로 본다.
     */
    const text = geminiProvider.outboundFields.find((f) => f.key === 'text');
    expect(text).toBeDefined();
    expect(text!.detail).toMatch(/검색/);

    // 이미지는 기록 입력에서만 나간다 — 찾을 때는 나가지 않는다는 사실도 적혀 있어야 한다.
    const image = geminiProvider.outboundFields.find((f) => f.key === 'image');
    expect(image!.detail).toMatch(/기록 입력/);

    /*
     * 설정 화면의 문장도 함께 본다. 항목 목록만 맞고 그 위의 문장이 '조회에서는
     * 나가지 않는다'고 말하면 사용자가 읽는 안내는 여전히 틀린 것이다 — 실제로
     * 그 문장이 남아 있었다.
     */
    const settings = fs.readFileSync(path.join(process.cwd(), 'src/app/settings/page.tsx'), 'utf8');
    expect(settings).not.toMatch(/조회·요약·백업에서는 나가지 않아요/);
    expect(settings).toMatch(/내역을 찾을 때/);
  });

  it('[TC-ENTRY-39] FR-ENTRY-18: 이미지 첨부 안내에 전송 사실과 가림 권고가 함께 있다', () => {
    expect(IMAGE_ATTACH_NOTICE).toMatch(/전송/);
    expect(IMAGE_ATTACH_NOTICE).toMatch(/가리/);
  });
});
