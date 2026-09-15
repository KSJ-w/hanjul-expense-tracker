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

  it('[TC-ENTRY-39] FR-ENTRY-18: 이미지 첨부 안내에 전송 사실과 가림 권고가 함께 있다', () => {
    expect(IMAGE_ATTACH_NOTICE).toMatch(/전송/);
    expect(IMAGE_ATTACH_NOTICE).toMatch(/가리/);
  });
});
