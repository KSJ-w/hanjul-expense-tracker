/**
 * ENTRY — 외부 해석 수단이 죽었을 때.
 * 원칙 3: 자동이 실패해도 길이 끊기지 않는다. 다만 실패 사실은 반드시 전달된다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { freshDb, cleanup, categoryIdByName, interpretViaBoundary, TODAY, type TestEnv } from './helpers';
import { createRecord, listByDate } from '@/lib/repo/records';

let env: TestEnv;
let originalFetch: typeof globalThis.fetch;
let originalKey: string | undefined;

beforeEach(() => {
  env = freshDb();
  originalFetch = globalThis.fetch;
  originalKey = process.env.GEMINI_API_KEY;
  // 외부 수단이 '설정은 되어 있으나 응답하지 않는' 상태를 만든다.
  process.env.GEMINI_API_KEY = 'test-key-not-real';
  globalThis.fetch = vi.fn(async () => {
    throw new Error('network down');
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  cleanup(env);
});

describe('ENTRY 외부 수단 실패', () => {
  it('[TC-ENTRY-28] FR-ENTRY-14: 외부 수단이 응답하지 않아도 직접 기록은 만들어진다', () => {
    const r = createRecord(
      {
        date: TODAY,
        amount: 8000,
        direction: 'expense',
        categoryId: categoryIdByName('식비', env.db),
        note: '점심',
      },
      env.db,
    );
    expect(r.ok).toBe(true);
    expect(listByDate(TODAY, env.db).items).toHaveLength(1);
  });

  it('[TC-ENTRY-29] FR-ENTRY-14, NFR-ENTRY-03: 기기 안 수단이 이어받고 실패 사실이 함께 전달된다', async () => {
    const out = await interpretViaBoundary('어제 점심 8000원', env.db);
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.items[0].amount).toBe(8000);
    expect(out.degraded).toBe(true);
    expect(out.failure).toBeDefined();
    // 사유가 없으면 "왜 안 되는가"에 아무도 답할 수 없다. 실제로 그런 일이 있었다.
    expect(out.failureDetail).toBeTruthy();
  });
});
