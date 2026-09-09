/**
 * VIEW — 예산. 예산의 부재와 금액 0 은 서로 다른 상태다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, type TestEnv } from './helpers';
import { setBudget, listBudgets, budgetComparison } from '@/lib/repo/budgets';
import { createRecord } from '@/lib/repo/records';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function spend(categoryName: string, amount: number, date = '2026-09-10') {
  const r = createRecord(
    {
      date,
      amount,
      direction: 'expense',
      categoryId: categoryIdByName(categoryName, env.db),
      note: '테스트',
    },
    env.db,
  );
  if (!r.ok) throw new Error('전제 실패');
}

describe('VIEW 예산', () => {
  it('[TC-VIEW-20] FR-VIEW-08: 정한 예산이 저장되고 조회된다', () => {
    const food = categoryIdByName('식비', env.db);
    expect(setBudget(food, '2026-09', 300_000, env.db).ok).toBe(true);
    const list = listBudgets('2026-09', env.db);
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(300_000);
  });

  it('[TC-VIEW-21] FR-VIEW-08: 같은 분류·기간에 다시 정하면 덮어써진다', () => {
    const food = categoryIdByName('식비', env.db);
    setBudget(food, '2026-09', 300_000, env.db);
    setBudget(food, '2026-09', 250_000, env.db);
    const list = listBudgets('2026-09', env.db);
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(250_000);
  });

  it('[TC-VIEW-22] FR-VIEW-09: 예산과 같은 기간의 지출이 함께 나온다', () => {
    const food = categoryIdByName('식비', env.db);
    setBudget(food, '2026-09', 300_000, env.db);
    spend('식비', 120_000);
    const row = budgetComparison('2026-09', env.db).find((r) => r.categoryId === food)!;
    expect(row.budget).toBe(300_000);
    expect(row.spent).toBe(120_000);
    expect(row.remaining).toBe(180_000);
  });

  it('[TC-VIEW-23] FR-VIEW-09: 예산이 없으면 없음 그대로 나오고 초과로 표시되지 않는다', () => {
    spend('교통', 50_000);
    const row = budgetComparison('2026-09', env.db).find(
      (r) => r.categoryId === categoryIdByName('교통', env.db),
    )!;
    expect(row.budget).toBeNull();
    expect(row.remaining).toBeNull();
    expect(row.ratio).toBeNull();
  });

  it('[TC-VIEW-24] FR-VIEW-09: 예산 0원은 예산 없음과 구분된다', () => {
    const food = categoryIdByName('식비', env.db);
    setBudget(food, '2026-09', 0, env.db);
    spend('식비', 10_000);
    const row = budgetComparison('2026-09', env.db).find((r) => r.categoryId === food)!;
    expect(row.budget).toBe(0);
    expect(row.budget).not.toBeNull();
    expect(row.remaining).toBe(-10_000);
  });
});
