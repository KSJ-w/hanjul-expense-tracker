import type { DatabaseSync } from 'node:sqlite';
import { getDb, newId, nowISO } from '../db';
import type { Direction, QueryOutcome, RecordEntry, RecordQuery } from '../domain/types';
import { isISODate, periodRange, previousPeriods, type PeriodType } from '../domain/date';

interface Row {
  id: string;
  date: string;
  amount: number;
  direction: Direction;
  category_id: string | null;
  note: string;
  merchant: string | null;
  image_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function toRecord(r: Row): RecordEntry {
  return {
    id: r.id,
    date: r.date,
    amount: r.amount,
    direction: r.direction,
    categoryId: r.category_id,
    note: r.note,
    merchant: r.merchant,
    imageId: r.image_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export interface NewRecordInput {
  date: string;
  amount: number;
  direction: Direction;
  categoryId?: string | null;
  note?: string;
  merchant?: string | null;
  imageId?: string | null;
}

export type CreateResult =
  | { ok: true; record: RecordEntry }
  | { ok: false; reason: 'invalid-date' | 'invalid-amount' | 'invalid-direction' };

/**
 * 확정 기록을 만든다.
 * 여기가 확정 기록이 생기는 유일한 문이다 — 확인 동작을 거친 호출만 들어온다
 * (SDD §2 불변조건 3, FR-ENTRY-05).
 */
export function createRecord(input: NewRecordInput, db: DatabaseSync = getDb()): CreateResult {
  if (!isISODate(input.date)) return { ok: false, reason: 'invalid-date' };
  if (!Number.isInteger(input.amount) || input.amount <= 0)
    return { ok: false, reason: 'invalid-amount' };
  if (input.direction !== 'income' && input.direction !== 'expense')
    return { ok: false, reason: 'invalid-direction' };

  const id = newId('rec');
  const now = nowISO();
  db.prepare(
    `INSERT INTO records (id, date, amount, direction, category_id, note, merchant, image_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    input.date,
    input.amount,
    input.direction,
    input.categoryId ?? null,
    input.note ?? '',
    input.merchant ?? null,
    input.imageId ?? null,
    now,
    now,
  );
  return { ok: true, record: getRecord(id, db)! };
}

export function getRecord(id: string, db: DatabaseSync = getDb()): RecordEntry | null {
  const r = db.prepare('SELECT * FROM records WHERE id = ?').get(id) as unknown as Row | undefined;
  return r ? toRecord(r) : null;
}

export type UpdateResult =
  | { ok: true; record: RecordEntry }
  | { ok: false; reason: 'not-found' | 'invalid-date' | 'invalid-amount' | 'invalid-direction' };

/**
 * FR-ENTRY-09.
 * 값이 부적합하면 아무것도 바꾸지 않는다 — 원래 기록이 훼손되어서는 안 된다
 * (PRD US-03-02 수용 조건 4).
 */
export function updateRecord(
  id: string,
  patch: Partial<NewRecordInput>,
  db: DatabaseSync = getDb(),
): UpdateResult {
  const cur = getRecord(id, db);
  if (!cur || cur.deletedAt) return { ok: false, reason: 'not-found' };

  const next = {
    date: patch.date ?? cur.date,
    amount: patch.amount ?? cur.amount,
    direction: patch.direction ?? cur.direction,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : cur.categoryId,
    note: patch.note !== undefined ? patch.note : cur.note,
    merchant: patch.merchant !== undefined ? patch.merchant : cur.merchant,
    imageId: patch.imageId !== undefined ? patch.imageId : cur.imageId,
  };
  if (!isISODate(next.date)) return { ok: false, reason: 'invalid-date' };
  if (!Number.isInteger(next.amount) || next.amount <= 0) return { ok: false, reason: 'invalid-amount' };
  if (next.direction !== 'income' && next.direction !== 'expense')
    return { ok: false, reason: 'invalid-direction' };

  db.prepare(
    `UPDATE records SET date=?, amount=?, direction=?, category_id=?, note=?, merchant=?, image_id=?, updated_at=?
     WHERE id = ?`,
  ).run(
    next.date,
    next.amount,
    next.direction,
    next.categoryId,
    next.note,
    next.merchant,
    next.imageId,
    nowISO(),
    id,
  );
  return { ok: true, record: getRecord(id, db)! };
}

/** FR-ENTRY-10 — 표시로 지운다. 자료는 남는다(SDD 불변조건 6). */
export function deleteRecord(id: string, db: DatabaseSync = getDb()): { ok: boolean } {
  const cur = getRecord(id, db);
  if (!cur || cur.deletedAt) return { ok: false };
  db.prepare('UPDATE records SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
    nowISO(),
    nowISO(),
    id,
  );
  return { ok: true };
}

/** FR-ENTRY-11 — 삭제 직전의 값 그대로 되살린다. 기간 제한을 두지 않는다(RFP R-06). */
export function restoreRecord(id: string, db: DatabaseSync = getDb()): { ok: boolean } {
  const cur = getRecord(id, db);
  if (!cur || !cur.deletedAt) return { ok: false };
  db.prepare('UPDATE records SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(nowISO(), id);
  return { ok: true };
}

/** 가장 최근에 지운 기록. 되살리기의 기본 대상이 된다. */
export function lastDeletedRecord(db: DatabaseSync = getDb()): RecordEntry | null {
  const r = db
    .prepare('SELECT * FROM records WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1')
    .get() as unknown as Row | undefined;
  return r ? toRecord(r) : null;
}

/** FR-VIEW-02 — 지정한 날짜의 확정 기록. */
export function listByDate(date: string, db: DatabaseSync = getDb()): QueryOutcome<RecordEntry> {
  const rows = db
    .prepare(
      'SELECT * FROM records WHERE date = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    )
    .all(date) as unknown as Row[];
  return { items: rows.map(toRecord), noMatch: rows.length === 0 };
}

/** FR-VIEW-06 — 지정된 조건을 모두 만족하는 기록만 반환한다. */
export function queryRecords(q: RecordQuery, db: DatabaseSync = getDb()): QueryOutcome<RecordEntry> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: (string | number)[] = [];
  if (q.from) {
    where.push('date >= ?');
    params.push(q.from);
  }
  if (q.to) {
    where.push('date <= ?');
    params.push(q.to);
  }
  if (q.categoryId) {
    where.push('category_id = ?');
    params.push(q.categoryId);
  }
  if (q.direction) {
    where.push('direction = ?');
    params.push(q.direction);
  }
  if (q.amountMin !== undefined) {
    where.push('amount >= ?');
    params.push(q.amountMin);
  }
  if (q.amountMax !== undefined) {
    where.push('amount <= ?');
    params.push(q.amountMax);
  }
  if (q.text) {
    where.push('(note LIKE ? OR merchant LIKE ?)');
    params.push(`%${q.text}%`, `%${q.text}%`);
  }
  const limit = q.limit ?? 200;
  const offset = q.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT * FROM records WHERE ${where.join(' AND ')} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as Row[];
  return { items: rows.map(toRecord), noMatch: rows.length === 0 };
}

export function countRecords(q: RecordQuery = {}, db: DatabaseSync = getDb()): number {
  const r = queryRecords({ ...q, limit: 1_000_000, offset: 0 }, db);
  return r.items.length;
}

export interface DayPresence {
  date: string;
  expense: number;
  income: number;
  count: number;
}

/** FR-VIEW-01 — 지정된 달의 날짜별 기록 존재와 합계. */
export function monthPresence(monthKeyStr: string, db: DatabaseSync = getDb()): DayPresence[] {
  const rows = db
    .prepare(
      `SELECT date,
              SUM(CASE WHEN direction='expense' THEN amount ELSE 0 END) AS expense,
              SUM(CASE WHEN direction='income'  THEN amount ELSE 0 END) AS income,
              COUNT(*) AS count
       FROM records
       WHERE deleted_at IS NULL AND date LIKE ?
       GROUP BY date ORDER BY date`,
    )
    .all(`${monthKeyStr}-%`) as unknown as DayPresence[];
  return rows;
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
  count: number;
}

/** FR-VIEW-03 — 기간의 거래 방향별 합계. */
export function totalsInRange(from: string, to: string, db: DatabaseSync = getDb()): Totals {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN direction='income'  THEN amount ELSE 0 END),0) AS income,
              COALESCE(SUM(CASE WHEN direction='expense' THEN amount ELSE 0 END),0) AS expense,
              COUNT(*) AS count
       FROM records WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`,
    )
    .get(from, to) as { income: number; expense: number; count: number };
  return { income: r.income, expense: r.expense, net: r.income - r.expense, count: r.count };
}

export function totalsForPeriod(type: PeriodType, anchor: string, db: DatabaseSync = getDb()): Totals {
  const { from, to } = periodRange(type, anchor);
  return totalsInRange(from, to, db);
}

export interface CategorySlice {
  categoryId: string | null;
  amount: number;
  count: number;
}

/** FR-VIEW-04 — 기간의 지출을 분류별로 집계. */
export function categoryBreakdown(
  from: string,
  to: string,
  direction: Direction = 'expense',
  db: DatabaseSync = getDb(),
): CategorySlice[] {
  return db
    .prepare(
      `SELECT category_id AS categoryId, SUM(amount) AS amount, COUNT(*) AS count
       FROM records
       WHERE deleted_at IS NULL AND direction = ? AND date BETWEEN ? AND ?
       GROUP BY category_id ORDER BY amount DESC`,
    )
    .all(direction, from, to) as unknown as CategorySlice[];
}

export interface SeriesPoint {
  label: string;
  from: string;
  to: string;
  income: number;
  expense: number;
}

/** FR-VIEW-05 — 연속된 기간의 합계를 시간 순서로. */
export function periodSeries(
  type: PeriodType,
  anchor: string,
  count: number,
  db: DatabaseSync = getDb(),
): SeriesPoint[] {
  return previousPeriods(type, anchor, count).map((p) => {
    const t = totalsInRange(p.from, p.to, db);
    return { label: p.label, from: p.from, to: p.to, income: t.income, expense: t.expense };
  });
}

/** 기록이 하나라도 있는지 — 첫 진입 화면의 빈 상태 판단에 쓴다(FR-ENTRY-17). */
export function hasAnyRecord(db: DatabaseSync = getDb()): boolean {
  const r = db.prepare('SELECT 1 AS x FROM records WHERE deleted_at IS NULL LIMIT 1').get() as
    | { x: number }
    | undefined;
  return !!r;
}
