/**
 * ENTRY — 입력에서 기록 후보 만들기.
 * 여기서 다루지 않는 것: 확인 동작 이후의 저장(entry.confirm), 외부 수단 실패(entry.fallback).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, interpretText, TODAY, type TestEnv } from './helpers';
import { computeUnresolved } from '@/lib/repo/candidates';
import { heuristicProvider } from '@/lib/interpret/heuristic';
import { listCategories } from '@/lib/repo/categories';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

describe('ENTRY 해석', () => {
  it('[TC-ENTRY-01] FR-ENTRY-01: 자연어 한 줄에서 네 항목을 갖춘 후보가 나온다', async () => {
    const r = await interpretText('김밥천국 8000원', env.db);
    expect(r.items).toHaveLength(1);
    const it0 = r.items[0];
    expect(it0).toHaveProperty('date');
    expect(it0).toHaveProperty('amount');
    expect(it0).toHaveProperty('direction');
    expect(it0).toHaveProperty('categoryId');
    expect(it0.amount).toBe(8000);
  });

  it('[TC-ENTRY-02] FR-ENTRY-01: 금액이 없으면 미확정으로 표시된다', async () => {
    const r = await interpretText('점심', env.db);
    expect(r.items[0].amount).toBeNull();
    expect(computeUnresolved(r.items[0])).toContain('amount');
  });

  it('[TC-ENTRY-03] FR-ENTRY-02: "어제"가 기준일 하루 전으로 확정된다', async () => {
    const r = await interpretText('어제 점심 8000원', env.db);
    expect(r.items[0].date).toBe('2026-09-07');
  });

  it('[TC-ENTRY-04] FR-ENTRY-02: "지난주 금요일"이 확정 날짜로 바뀐다', async () => {
    const r = await interpretText('지난주 금요일 커피 4500원', env.db);
    expect(r.items[0].date).toBe('2026-09-04');
  });

  it('[TC-ENTRY-05] FR-ENTRY-02: "3일 전"이 확정 날짜로 바뀐다', async () => {
    const r = await interpretText('3일 전 택시 12000원', env.db);
    expect(r.items[0].date).toBe('2026-09-05');
  });

  it('[TC-ENTRY-06] FR-ENTRY-02: 날짜 표현이 없으면 기준일을 쓴다', async () => {
    const r = await interpretText('커피 4500원', env.db);
    expect(r.items[0].date).toBe(TODAY);
  });

  it('[TC-ENTRY-07] FR-ENTRY-01: "3만5천원"을 35000으로 읽는다', async () => {
    const r = await interpretText('3만5천원 회식', env.db);
    expect(r.items[0].amount).toBe(35000);
  });

  it('[TC-ENTRY-08] FR-ENTRY-01: 수입 표현이면 방향이 income 이다', async () => {
    const r = await interpretText('월급 300만원 들어옴', env.db);
    expect(r.items[0].amount).toBe(3_000_000);
    expect(r.items[0].direction).toBe('income');
  });

  it('[TC-ENTRY-09] FR-ENTRY-03: 한 입력에 두 거래가 있으면 후보가 둘이다', async () => {
    const r = await interpretText('점심 8000원, 커피 4500원', env.db);
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.amount).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([4500, 8000]);
  });

  it('[TC-ENTRY-10] FR-ENTRY-03: 금액이 하나면 문장이 길어도 후보는 하나다', async () => {
    const r = await interpretText('어제 회사 근처에서 동료들이랑 저녁을 먹었는데 32000원 나왔다', env.db);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].amount).toBe(32000);
  });

  it('[TC-ENTRY-46] FR-ENTRY-03, FR-ENTRY-01: 방향이 섞인 입력은 조각마다 따로 판정된다', async () => {
    const r = await interpretText('그저께 스타벅스에서 커피 2만 3천원 쓰고, 어제 용돈 5만원 받았어', env.db);
    expect(r.items).toHaveLength(2);
    const spend = r.items.find((i) => i.amount === 23000)!;
    const earn = r.items.find((i) => i.amount === 50000)!;
    expect(spend.direction).toBe('expense');
    expect(earn.direction).toBe('income');
    expect(spend.date).toBe('2026-09-06');
    expect(earn.date).toBe('2026-09-07');
  });

  it('[TC-ENTRY-11] FR-ENTRY-04: 기기 안 수단은 이미지를 못 읽고 그 사실을 알린다', async () => {
    const r = await heuristicProvider.interpret({
      image: { base64: 'AAAA', mime: 'image/jpeg' },
      today: TODAY,
      categories: listCategories(undefined, env.db),
    });
    expect(r.items).toHaveLength(0);
    expect(r.failure).toBe('unparseable');
  });
});
