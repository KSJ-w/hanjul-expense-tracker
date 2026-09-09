/**
 * VIEW — 기간 합계·분류별 구성·시간축 계열.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, TODAY, type TestEnv } from './helpers';
import {
  createRecord,
  totalsForPeriod,
  totalsInRange,
  categoryBreakdown,
  periodSeries,
} from '@/lib/repo/records';
import type { Direction } from '@/lib/domain/types';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function put(date: string, amount: number, direction: Direction, categoryName: string | null) {
  const r = createRecord(
    {
      date,
      amount,
      direction,
      categoryId: categoryName ? categoryIdByName(categoryName, env.db) : null,
      note: '테스트',
    },
    env.db,
  );
  if (!r.ok) throw new Error('전제 실패');
}

describe('VIEW 기간 요약', () => {
  it('[TC-VIEW-07] FR-VIEW-03: 월 합계가 방향별로 나온다', () => {
    put('2026-09-01', 3_000_000, 'income', '급여');
    put('2026-09-10', 500_000, 'expense', '식비');
    const t = totalsForPeriod('month', TODAY, env.db);
    expect(t.income).toBe(3_000_000);
    expect(t.expense).toBe(500_000);
    expect(t.net).toBe(2_500_000);
  });

  it('[TC-VIEW-08] FR-VIEW-03: 주 합계는 월~일 범위만 담는다', () => {
    put('2026-09-07', 1000, 'expense', '식비'); // 이번 주 월
    put('2026-09-13', 2000, 'expense', '식비'); // 이번 주 일
    put('2026-09-14', 3000, 'expense', '식비'); // 다음 주 월
    const t = totalsForPeriod('week', TODAY, env.db);
    expect(t.count).toBe(2);
    expect(t.expense).toBe(3000);
  });

  it('[TC-VIEW-09] FR-VIEW-03: 연 합계는 그 해의 것만 담는다', () => {
    put('2025-12-31', 1000, 'expense', '식비');
    put('2026-01-01', 2000, 'expense', '식비');
    const t = totalsForPeriod('year', TODAY, env.db);
    expect(t.count).toBe(1);
    expect(t.expense).toBe(2000);
  });

  it('[TC-VIEW-10] FR-VIEW-03: 기록이 없는 기간의 합계는 0이다', () => {
    const t = totalsInRange('2026-01-01', '2026-01-31', env.db);
    expect(t.income).toBe(0);
    expect(t.expense).toBe(0);
    expect(t.count).toBe(0);
  });

  it('[TC-VIEW-11] FR-VIEW-04: 지출이 분류별로 묶인다', () => {
    put('2026-09-02', 8000, 'expense', '식비');
    put('2026-09-03', 12000, 'expense', '식비');
    put('2026-09-04', 3000, 'expense', '교통');
    const slices = categoryBreakdown('2026-09-01', '2026-09-30', 'expense', env.db);
    expect(slices).toHaveLength(2);
    const food = slices.find((s) => s.categoryId === categoryIdByName('식비', env.db))!;
    expect(food.amount).toBe(20000);
    expect(food.count).toBe(2);
  });

  it('[TC-VIEW-12] FR-VIEW-04: 분류가 없는 지출도 하나의 묶음으로 나온다', () => {
    put('2026-09-02', 8000, 'expense', null);
    const slices = categoryBreakdown('2026-09-01', '2026-09-30', 'expense', env.db);
    expect(slices.filter((s) => s.categoryId === null)).toHaveLength(1);
  });

  it('[TC-VIEW-13] FR-VIEW-05: 월 계열이 시간 순서로 나온다', () => {
    put('2026-07-10', 1000, 'expense', '식비');
    put('2026-08-10', 2000, 'expense', '식비');
    put('2026-09-10', 3000, 'expense', '식비');
    const s = periodSeries('month', TODAY, 3, env.db);
    expect(s).toHaveLength(3);
    expect(s[0].from < s[1].from).toBe(true);
    expect(s[1].from < s[2].from).toBe(true);
    expect(s.map((p) => p.expense)).toEqual([1000, 2000, 3000]);
  });

  it('[TC-VIEW-14] FR-VIEW-05: 기간이 하나뿐이면 하나만 나온다', () => {
    put('2026-09-10', 3000, 'expense', '식비');
    expect(periodSeries('month', TODAY, 1, env.db)).toHaveLength(1);
  });
});
