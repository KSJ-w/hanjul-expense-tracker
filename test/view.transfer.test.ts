/**
 * VIEW — 반출과 반입. 반출 파일만으로 복원되는지가 핵심이다(NFR-VIEW-03).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshDb, cleanup, categoryIdByName, type TestEnv } from './helpers';
import { createRecord, queryRecords } from '@/lib/repo/records';
import { exportBundle, importBundle } from '@/lib/transfer';
import { openDb } from '@/lib/db';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

function seed() {
  const rows = [
    { date: '2026-09-01', amount: 8000, note: '점심', cat: '식비' },
    { date: '2026-09-02', amount: 4500, note: '커피', cat: '카페/간식' },
    { date: '2026-09-03', amount: 12000, note: '택시', cat: '교통' },
  ];
  for (const r of rows) {
    const c = createRecord(
      {
        date: r.date,
        amount: r.amount,
        direction: 'expense',
        categoryId: categoryIdByName(r.cat, env.db),
        note: r.note,
      },
      env.db,
    );
    if (!c.ok) throw new Error('전제 실패');
  }
}

/** 반입 대상이 될 빈 저장소를 따로 연다. */
function emptyStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-tracker-import-'));
  const prev = process.env.EXPENSE_DATA_DIR;
  process.env.EXPENSE_DATA_DIR = dir;
  const db = openDb(path.join(dir, 'import.db'));
  process.env.EXPENSE_DATA_DIR = prev;
  return {
    db,
    dir,
    dispose() {
      try {
        db.close();
      } catch {
        /* noop */
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe('VIEW 반출·반입', () => {
  it('[TC-VIEW-25] FR-VIEW-10: 기록이 담긴 반출 자료가 나온다', () => {
    seed();
    const b = exportBundle({}, env.db);
    expect(b.records).toHaveLength(3);
    expect(b.format).toBe('expense-tracker-bundle');
  });

  it('[TC-VIEW-26] FR-VIEW-10: 반출할 기록이 없어도 실패가 아니다', () => {
    const b = exportBundle({}, env.db);
    expect(b.records).toHaveLength(0);
    expect(b.format).toBe('expense-tracker-bundle');
  });

  it('[TC-VIEW-27] FR-VIEW-11: 빈 저장소에 반입하면 기록이 들어온다', () => {
    seed();
    const b = exportBundle({}, env.db);
    const target = emptyStore();
    try {
      const r = importBundle(b, target.db);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.imported).toBe(3);
      expect(queryRecords({}, target.db).items).toHaveLength(3);
    } finally {
      target.dispose();
    }
  });

  it('[TC-VIEW-28] FR-VIEW-11: 형식이 맞지 않으면 반입하지 않고 기존 기록이 남는다', () => {
    seed();
    const before = queryRecords({}, env.db).items.length;
    const r = importBundle({ hello: 'world' }, env.db);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('bad-format');
    expect(queryRecords({}, env.db).items).toHaveLength(before);
  });

  it('[TC-VIEW-29] FR-VIEW-11: 겹치는 기록은 건너뛰고 그 수가 전달된다', () => {
    seed();
    const b = exportBundle({}, env.db);
    const r = importBundle(b, env.db); // 같은 저장소에 다시 반입 = 전부 겹침
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(3);
    expect(queryRecords({}, env.db).items).toHaveLength(3);
  });

  it('[TC-VIEW-30] NFR-VIEW-03: 반출 자료만으로 복원한 기록이 반출 시점과 일치한다', () => {
    seed();
    const b = exportBundle({}, env.db);
    const original = queryRecords({}, env.db).items;
    const target = emptyStore();
    try {
      importBundle(b, target.db);
      const restored = queryRecords({}, target.db).items;
      expect(restored).toHaveLength(original.length);

      const key = (r: (typeof original)[number]) =>
        [r.date, r.amount, r.direction, r.categoryId, r.note].join('|');
      expect(restored.map(key).sort()).toEqual(original.map(key).sort());
    } finally {
      target.dispose();
    }
  });
});
