/**
 * CAT — 분류의 추가·변경·삭제와 귀속 보존.
 * 여기서 다루지 않는 것: 자동 배정의 경계와 학습(cat.assign).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, TODAY, type TestEnv } from './helpers';
import {
  addCategory,
  renameCategory,
  deleteCategory,
  listCategories,
  getCategory,
  getCategoryName,
} from '@/lib/repo/categories';
import { createRecord, getRecord } from '@/lib/repo/records';
import { openDb, _setDbForTest } from '@/lib/db';
import path from 'node:path';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function makeRecordIn(categoryId: string) {
  const r = createRecord(
    { date: TODAY, amount: 8000, direction: 'expense', categoryId, note: '점심' },
    env.db,
  );
  if (!r.ok) throw new Error('전제 실패');
  return r.record.id;
}

describe('CAT 분류 관리', () => {
  it('[TC-CAT-01] FR-CAT-01: 추가한 분류가 선택지에 나타난다', () => {
    const r = addCategory('반려동물', 'expense', env.db);
    expect(r.ok).toBe(true);
    expect(listCategories('expense', env.db).map((c) => c.name)).toContain('반려동물');
  });

  it('[TC-CAT-02] FR-CAT-01: 같은 방향에 같은 이름은 추가되지 않는다', () => {
    const r = addCategory('식비', 'expense', env.db);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('duplicate-name');
  });

  it('[TC-CAT-03] FR-CAT-01: 빈 이름은 추가되지 않는다', () => {
    const r = addCategory('   ', 'expense', env.db);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('empty-name');
  });

  it('[TC-CAT-04] FR-CAT-02, NFR-CAT-01: 이름을 바꿔도 기록의 귀속이 그대로다', () => {
    const catId = categoryIdByName('식비', env.db);
    const recId = makeRecordIn(catId);
    expect(renameCategory(catId, '먹는데쓴돈', env.db).ok).toBe(true);
    expect(getRecord(recId, env.db)!.categoryId).toBe(catId);
    expect(getCategoryName(catId, env.db)).toBe('먹는데쓴돈');
  });

  it('[TC-CAT-05] FR-CAT-02: 다른 분류의 이름으로는 바꿀 수 없다', () => {
    const catId = categoryIdByName('식비', env.db);
    const r = renameCategory(catId, '교통', env.db);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('duplicate-name');
  });

  it('[TC-CAT-06] FR-CAT-03: 귀속 기록이 없는 분류는 지워져 선택지에서 빠진다', () => {
    const catId = categoryIdByName('경조사', env.db);
    const r = deleteCategory(catId, {}, env.db);
    expect(r.ok).toBe(true);
    expect(listCategories('expense', env.db).map((c) => c.id)).not.toContain(catId);
  });

  it('[TC-CAT-07] FR-CAT-08: 기록이 있는 분류는 확인 없이 지워지지 않는다', () => {
    const catId = categoryIdByName('식비', env.db);
    makeRecordIn(catId);
    const r = deleteCategory(catId, {}, env.db);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('has-records');
    expect(listCategories('expense', env.db).map((c) => c.id)).toContain(catId);
  });

  it('[TC-CAT-08] FR-CAT-08: 확인과 함께 지우면 선택지에서 빠진다', () => {
    const catId = categoryIdByName('식비', env.db);
    makeRecordIn(catId);
    const r = deleteCategory(catId, { confirmed: true }, env.db);
    expect(r.ok).toBe(true);
    expect(listCategories('expense', env.db).map((c) => c.id)).not.toContain(catId);
  });

  it('[TC-CAT-09] NFR-CAT-01: 지운 뒤에도 기록이 어느 분류였는지 남는다', () => {
    const catId = categoryIdByName('식비', env.db);
    const recId = makeRecordIn(catId);
    deleteCategory(catId, { confirmed: true }, env.db);
    expect(getRecord(recId, env.db)!.categoryId).toBe(catId);
    expect(getCategory(catId, env.db)).not.toBeNull();
    expect(getCategoryName(catId, env.db)).toBe('식비');
  });

  it('[TC-CAT-10] FR-CAT-04: 처음 열었을 때 분류 집합이 비어 있지 않다', () => {
    expect(listCategories('expense', env.db).length).toBeGreaterThan(0);
    expect(listCategories('income', env.db).length).toBeGreaterThan(0);
  });

  it('[TC-CAT-11] FR-CAT-04: 모두 지운 뒤 다시 열어도 지운 것이 되살아나지 않는다', () => {
    for (const c of listCategories(undefined, env.db)) {
      deleteCategory(c.id, { confirmed: true }, env.db);
    }
    expect(listCategories(undefined, env.db)).toHaveLength(0);

    env.db.close();
    const reopened = openDb(path.join(env.dir, 'test.db'));
    _setDbForTest(reopened);
    env.db = reopened;
    expect(listCategories(undefined, reopened)).toHaveLength(0);
  });

  it('[TC-CAT-12] FR-CAT-05: 수입 선택지와 지출 선택지가 섞이지 않는다', () => {
    expect(listCategories('income', env.db).every((c) => c.direction === 'income')).toBe(true);
    expect(listCategories('expense', env.db).every((c) => c.direction === 'expense')).toBe(true);
  });
});
