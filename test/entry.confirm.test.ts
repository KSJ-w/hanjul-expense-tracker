/**
 * ENTRY — 확인 동작. 확인을 거치지 않은 후보는 기록이 되지 않는다.
 * 여기서 다루지 않는 것: 해석 자체의 정확도(entry.interpret).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, TODAY, type TestEnv } from './helpers';
import { saveCandidates, confirmCandidate, updateCandidate, listCandidates } from '@/lib/repo/candidates';
import { queryRecords, getRecord } from '@/lib/repo/records';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function draft(over: Partial<Parameters<typeof saveCandidates>[0][number]> = {}) {
  return {
    source: 'text' as const,
    rawInput: '점심 8000원',
    date: TODAY,
    amount: 8000,
    direction: 'expense' as const,
    categoryId: categoryIdByName('식비', env.db),
    merchant: '김밥천국',
    note: '점심 8000원',
    unresolved: [],
    ...over,
  };
}

describe('ENTRY 확인 동작', () => {
  it('[TC-ENTRY-12] FR-ENTRY-05: 확인하지 않은 후보는 확정 기록이 되지 않는다', () => {
    saveCandidates([draft()], env.db);
    expect(queryRecords({}, env.db).items).toHaveLength(0);
  });

  it('[TC-ENTRY-13] FR-ENTRY-05: 확인하면 확정 기록이 되고 후보는 사라진다', () => {
    const [c] = saveCandidates([draft()], env.db);
    const r = confirmCandidate(c.id, env.db);
    expect(r.ok).toBe(true);
    expect(queryRecords({}, env.db).items).toHaveLength(1);
    expect(listCandidates(env.db)).toHaveLength(0);
  });

  it('[TC-ENTRY-14] FR-ENTRY-05: 여러 후보 중 확인한 것만 기록이 된다', () => {
    const list = saveCandidates([draft(), draft({ amount: 4500, rawInput: '커피 4500원' })], env.db);
    confirmCandidate(list[0].id, env.db);
    expect(queryRecords({}, env.db).items).toHaveLength(1);
    expect(listCandidates(env.db)).toHaveLength(1);
  });

  it('[TC-ENTRY-15] FR-ENTRY-06: 확인 전에 바꾼 분류가 확정에 반영된다', () => {
    const [c] = saveCandidates([draft()], env.db);
    const target = categoryIdByName('교통', env.db);
    updateCandidate(c.id, { categoryId: target }, env.db);
    const r = confirmCandidate(c.id, env.db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getRecord(r.recordId, env.db)!.categoryId).toBe(target);
  });

  it('[TC-ENTRY-16] FR-ENTRY-06: 확인 전에 바꾼 금액이 확정에 반영된다', () => {
    const [c] = saveCandidates([draft()], env.db);
    updateCandidate(c.id, { amount: 9500 }, env.db);
    const r = confirmCandidate(c.id, env.db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getRecord(r.recordId, env.db)!.amount).toBe(9500);
  });

  it('[TC-ENTRY-17] FR-ENTRY-07: 미확정 항목이 있으면 확정되지 않고 무엇이 비었는지 알린다', () => {
    const [c] = saveCandidates([draft({ amount: null })], env.db);
    const r = confirmCandidate(c.id, env.db);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('unresolved');
    if (r.reason !== 'unresolved') return;
    expect(r.fields).toContain('amount');
    expect(queryRecords({}, env.db).items).toHaveLength(0);
  });

  it('[TC-ENTRY-18] FR-ENTRY-07: 빈 항목만 채우면 이미 있던 값이 유지된 채 확정된다', () => {
    const [c] = saveCandidates([draft({ amount: null })], env.db);
    updateCandidate(c.id, { amount: 8000 }, env.db);
    const r = confirmCandidate(c.id, env.db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = getRecord(r.recordId, env.db)!;
    expect(rec.date).toBe(TODAY);
    expect(rec.direction).toBe('expense');
    expect(rec.amount).toBe(8000);
  });

  it('[TC-ENTRY-19] FR-ENTRY-07: 해석이 실패해도 사용자가 적은 원문은 남는다', () => {
    const raw = '뭐라고 적었는지 모르겠는 문장';
    const [c] = saveCandidates(
      [draft({ rawInput: raw, amount: null, date: null, direction: null, categoryId: null })],
      env.db,
    );
    expect(c.rawInput).toBe(raw);
  });
});
