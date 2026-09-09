/**
 * ENTRY — 반복 항목. 날짜가 되면 '후보'를 낸다. 확정하지 않는다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, type TestEnv } from './helpers';
import { addRecurring, emitDueRecurring } from '@/lib/repo/recurring';
import { listCandidates } from '@/lib/repo/candidates';
import { queryRecords } from '@/lib/repo/records';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function addMonthly(anchorDay: number) {
  const r = addRecurring(
    {
      name: '넷플릭스',
      amount: 17000,
      direction: 'expense',
      categoryId: categoryIdByName('주거/통신', env.db),
      anchorDay,
    },
    env.db,
  );
  if (!r.ok) throw new Error('전제 실패');
  return r.id;
}

describe('ENTRY 반복 항목', () => {
  it('[TC-ENTRY-30] FR-ENTRY-12: 기준일이 되면 후보가 나온다', () => {
    addMonthly(15);
    emitDueRecurring('2026-09-15', env.db);
    const list = listCandidates(env.db);
    expect(list).toHaveLength(1);
    expect(list[0].date).toBe('2026-09-15');
    expect(list[0].amount).toBe(17000);
  });

  it('[TC-ENTRY-31] FR-ENTRY-12: 기준일 전에는 후보가 나오지 않는다', () => {
    addMonthly(15);
    emitDueRecurring('2026-09-10', env.db);
    expect(listCandidates(env.db)).toHaveLength(0);
  });

  it('[TC-ENTRY-32] FR-ENTRY-12: 그 달에 없는 날짜는 마지막 날로 당겨진다', () => {
    addMonthly(31);
    emitDueRecurring('2026-02-28', env.db);
    const list = listCandidates(env.db);
    expect(list).toHaveLength(1);
    expect(list[0].date).toBe('2026-02-28');
  });

  it('[TC-ENTRY-33] FR-ENTRY-12, FR-ENTRY-05: 같은 달에 두 번 나오지 않고, 확정되지도 않는다', () => {
    addMonthly(15);
    emitDueRecurring('2026-09-15', env.db);
    emitDueRecurring('2026-09-16', env.db);
    expect(listCandidates(env.db)).toHaveLength(1);
    expect(queryRecords({}, env.db).items).toHaveLength(0);
  });
});
