/**
 * VIEW — 날짜로 보기, 그리고 "찾지 못한 것"과 "없었던 것"의 구분.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, type TestEnv } from './helpers';
import { createRecord, monthPresence, listByDate, queryRecords } from '@/lib/repo/records';
import type { Direction } from '@/lib/domain/types';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function put(date: string, amount: number, direction: Direction = 'expense', note = '테스트') {
  const r = createRecord(
    {
      date,
      amount,
      direction,
      categoryId: categoryIdByName(direction === 'expense' ? '식비' : '급여', env.db),
      note,
    },
    env.db,
  );
  if (!r.ok) throw new Error('전제 실패');
  return r.record.id;
}

describe('VIEW 달력', () => {
  it('[TC-VIEW-01] FR-VIEW-01: 기록이 있는 날짜만 달력 자료에 나온다', () => {
    put('2026-09-03', 8000);
    put('2026-09-03', 4500);
    put('2026-09-05', 12000);
    const days = monthPresence('2026-09', env.db);
    expect(days.map((d) => d.date)).toEqual(['2026-09-03', '2026-09-05']);
  });

  it('[TC-VIEW-02] FR-VIEW-01: 같은 날의 지출 합계와 수입 합계가 따로 나온다', () => {
    put('2026-09-03', 8000, 'expense');
    put('2026-09-03', 2000, 'expense');
    put('2026-09-03', 500000, 'income');
    const day = monthPresence('2026-09', env.db).find((d) => d.date === '2026-09-03')!;
    expect(day.expense).toBe(10000);
    expect(day.income).toBe(500000);
    expect(day.count).toBe(3);
  });

  it('[TC-VIEW-03] FR-VIEW-01: 기록이 없으면 빈 목록이 온다', () => {
    expect(monthPresence('2026-09', env.db)).toEqual([]);
  });

  it('[TC-VIEW-04] FR-VIEW-02: 지정한 날짜의 기록이 온다', () => {
    put('2026-09-05', 1000);
    put('2026-09-05', 2000);
    put('2026-09-05', 3000);
    put('2026-09-06', 4000);
    const out = listByDate('2026-09-05', env.db);
    expect(out.items).toHaveLength(3);
    expect(out.items.every((r) => r.date === '2026-09-05')).toBe(true);
  });

  it('[TC-VIEW-05] FR-VIEW-02, FR-VIEW-07: 그날 기록이 없으면 "찾지 못함"으로 온다', () => {
    const out = listByDate('2026-09-05', env.db);
    expect(out.items).toHaveLength(0);
    expect(out.noMatch).toBe(true);
  });

  it('[TC-VIEW-06] FR-VIEW-07: 조건 조회의 빈 결과는 부재가 아니라 미발견으로 표시된다', () => {
    put('2026-09-05', 1000);
    const out = queryRecords({ from: '2026-10-01', to: '2026-10-31' }, env.db);
    expect(out.items).toHaveLength(0);
    expect(out).toHaveProperty('noMatch', true);
    // 반환 형태에 "거래가 없었다"를 단정하는 값이 없어야 한다.
    expect(Object.keys(out).sort()).toEqual(['items', 'noMatch']);
  });
});
