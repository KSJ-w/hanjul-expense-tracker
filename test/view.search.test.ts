/**
 * VIEW — 조건으로 찾기. 지정된 조건을 모두 만족하는 것만 나와야 한다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, type TestEnv } from './helpers';
import { createRecord, queryRecords } from '@/lib/repo/records';
import type { Direction } from '@/lib/domain/types';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function put(date: string, amount: number, categoryName: string, note: string, direction: Direction = 'expense') {
  const r = createRecord(
    { date, amount, direction, categoryId: categoryIdByName(categoryName, env.db), note },
    env.db,
  );
  if (!r.ok) throw new Error('전제 실패');
}

function seed() {
  put('2026-08-01', 5000, '식비', '국밥');
  put('2026-09-05', 12000, '교통', '택시 타고 귀가');
  put('2026-09-20', 30000, '식비', '회식 자리');
}

describe('VIEW 조건 조회', () => {
  it('[TC-VIEW-15] FR-VIEW-06: 기간 조건에 맞는 것만 나온다', () => {
    seed();
    const out = queryRecords({ from: '2026-09-01', to: '2026-09-30' }, env.db);
    expect(out.items).toHaveLength(2);
    expect(out.items.every((r) => r.date >= '2026-09-01' && r.date <= '2026-09-30')).toBe(true);
  });

  it('[TC-VIEW-16] FR-VIEW-06: 분류 조건에 맞는 것만 나온다', () => {
    seed();
    const food = categoryIdByName('식비', env.db);
    const out = queryRecords({ categoryId: food }, env.db);
    expect(out.items).toHaveLength(2);
    expect(out.items.every((r) => r.categoryId === food)).toBe(true);
  });

  it('[TC-VIEW-17] FR-VIEW-06: 금액 범위에 맞는 것만 나온다', () => {
    seed();
    const out = queryRecords({ amountMin: 10000, amountMax: 20000 }, env.db);
    expect(out.items).toHaveLength(1);
    expect(out.items.every((r) => r.amount >= 10000 && r.amount <= 20000)).toBe(true);
  });

  it('[TC-VIEW-18] FR-VIEW-06: 내용 문자열이 담긴 것만 나온다', () => {
    seed();
    const out = queryRecords({ text: '회식' }, env.db);
    expect(out.items).toHaveLength(1);
    expect(out.items.every((r) => r.note.includes('회식'))).toBe(true);
  });

  it('[TC-VIEW-19] FR-VIEW-06: 두 조건을 함께 걸면 둘 다 만족하는 것만 나온다', () => {
    seed();
    const food = categoryIdByName('식비', env.db);
    const out = queryRecords({ categoryId: food, from: '2026-09-01', to: '2026-09-30' }, env.db);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].categoryId).toBe(food);
    expect(out.items[0].date >= '2026-09-01').toBe(true);
  });
});
