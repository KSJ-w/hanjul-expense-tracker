/**
 * ENTRY — 직접 기록·정정·되살리기, 근거 이미지, 첫 진입.
 * 여기서 다루지 않는 것: 해석(entry.interpret), 확인 동작(entry.confirm).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, TODAY, type TestEnv } from './helpers';
import { groupDigits } from '@/lib/domain/money';
import {
  createRecord,
  updateRecord,
  deleteRecord,
  restoreRecord,
  getRecord,
  listByDate,
  totalsInRange,
  lastDeletedRecord,
} from '@/lib/repo/records';
import { buildHomeState } from '@/lib/app/home';
import { newId, nowISO } from '@/lib/db';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function base() {
  return {
    date: TODAY,
    amount: 8000,
    direction: 'expense' as const,
    categoryId: categoryIdByName('식비', env.db),
    note: '점심',
  };
}

describe('ENTRY 직접 기록과 정정', () => {
  it('[TC-ENTRY-20] FR-ENTRY-08: 자동 해석 없이 직접 기록을 만들 수 있다', () => {
    const r = createRecord(base(), env.db);
    expect(r.ok).toBe(true);
    expect(listByDate(TODAY, env.db).items).toHaveLength(1);
  });

  it('[TC-ENTRY-21] FR-ENTRY-08: 금액이 0이면 기록이 만들어지지 않는다', () => {
    const r = createRecord({ ...base(), amount: 0 }, env.db);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid-amount');
  });

  it('[TC-ENTRY-22] FR-ENTRY-09: 고친 값이 이후 조회에 반영된다', () => {
    const c = createRecord(base(), env.db);
    if (!c.ok) throw new Error('전제 실패');
    updateRecord(c.record.id, { amount: 12000 }, env.db);
    expect(getRecord(c.record.id, env.db)!.amount).toBe(12000);
  });

  it('[TC-ENTRY-23] FR-ENTRY-09: 값이 부적합하면 원래 기록이 훼손되지 않는다', () => {
    const c = createRecord(base(), env.db);
    if (!c.ok) throw new Error('전제 실패');
    const before = getRecord(c.record.id, env.db)!;
    const r = updateRecord(c.record.id, { date: '2026-13-40' }, env.db);
    expect(r.ok).toBe(false);
    const after = getRecord(c.record.id, env.db)!;
    expect(after.date).toBe(before.date);
    expect(after.amount).toBe(before.amount);
  });

  it('[TC-ENTRY-24] FR-ENTRY-10: 지운 기록은 날짜 조회에서 빠진다', () => {
    const c = createRecord(base(), env.db);
    if (!c.ok) throw new Error('전제 실패');
    deleteRecord(c.record.id, env.db);
    expect(listByDate(TODAY, env.db).items).toHaveLength(0);
  });

  it('[TC-ENTRY-25] FR-ENTRY-10: 지운 기록은 기간 합계에서 빠진다', () => {
    const c = createRecord(base(), env.db);
    if (!c.ok) throw new Error('전제 실패');
    deleteRecord(c.record.id, env.db);
    expect(totalsInRange(TODAY, TODAY, env.db).expense).toBe(0);
  });

  it('[TC-ENTRY-26] FR-ENTRY-11: 되살리면 삭제 직전 값 그대로 돌아온다', () => {
    const c = createRecord(base(), env.db);
    if (!c.ok) throw new Error('전제 실패');
    const before = getRecord(c.record.id, env.db)!;
    deleteRecord(c.record.id, env.db);
    restoreRecord(c.record.id, env.db);
    const after = getRecord(c.record.id, env.db)!;
    expect(after.deletedAt).toBeNull();
    expect(after.date).toBe(before.date);
    expect(after.amount).toBe(before.amount);
    expect(after.direction).toBe(before.direction);
    expect(after.categoryId).toBe(before.categoryId);
    expect(after.note).toBe(before.note);
  });

  it('[TC-ENTRY-27] FR-ENTRY-11: 되살릴 대상이 없으면 실패하고 다른 기록은 그대로다', () => {
    const c = createRecord(base(), env.db);
    if (!c.ok) throw new Error('전제 실패');
    expect(lastDeletedRecord(env.db)).toBeNull();
    const r = restoreRecord(c.record.id, env.db);
    expect(r.ok).toBe(false);
    expect(listByDate(TODAY, env.db).items).toHaveLength(1);
  });

  it('[TC-ENTRY-34] FR-ENTRY-13: 이미지에서 만든 기록은 근거 이미지 참조를 유지한다', () => {
    const imageId = newId('img');
    env.db
      .prepare('INSERT INTO images (id, rel_path, mime, bytes, created_at) VALUES (?,?,?,?,?)')
      .run(imageId, `${imageId}.jpg`, 'image/jpeg', 1234, nowISO());
    const c = createRecord({ ...base(), imageId }, env.db);
    if (!c.ok) throw new Error('전제 실패');
    const rec = getRecord(c.record.id, env.db)!;
    expect(rec.imageId).toBe(imageId);
    const img = env.db.prepare('SELECT id FROM images WHERE id = ?').get(rec.imageId!);
    expect(img).toBeTruthy();
  });

  it('[TC-ENTRY-40] FR-ENTRY-17: 기록이 없어도 첫 진입에서 입력 수단이 제시된다', () => {
    const s = buildHomeState(env.db, TODAY);
    expect(s.hasRecords).toBe(false);
    expect(s.inputAvailable).toBe(true);
    expect(s.emptyStateIsUsable).toBe(true);
  });
});

/**
 * 적는 동안의 금액 표시 — ADR-026.
 * 화면의 다른 모든 금액은 자릿점과 함께 보이는데 적는 칸만 맨 숫자였다.
 */
describe('ENTRY 금액을 적는 동안', () => {
  it('[TC-ENTRY-47] FR-ENTRY-08, FR-ENTRY-09: 적히는 중인 금액에 세 자리마다 자릿점을 넣는다', () => {
    expect(groupDigits('1000')).toBe('1,000');
    expect(groupDigits('999')).toBe('999');
    expect(groupDigits('')).toBe('');
    // 앞자리 0 은 사람이 적으려던 값이 아니다.
    expect(groupDigits('007')).toBe('7');
    expect(groupDigits('0')).toBe('0');
    // 숫자가 아닌 글자는 걷어낸다 — 이미 찍힌 자릿점도 포함이다(다시 찍는다).
    expect(groupDigits('1,234원')).toBe('1,234');
    // Number 를 거치지 않으므로 자릿수가 커져도 숫자가 흔들리지 않는다.
    expect(groupDigits('12345678901234567')).toBe('12,345,678,901,234,567');
  });
});
