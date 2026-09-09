import type { DatabaseSync } from 'node:sqlite';
import { getDb, newId, nowISO } from '../db';
import type { Candidate, CandidateSource, Direction, UnresolvedField } from '../domain/types';
import { createRecord, type CreateResult } from './records';
import { rememberMerchantCategory } from './merchantRules';

interface Row {
  id: string;
  source: CandidateSource;
  raw_input: string;
  date: string | null;
  amount: number | null;
  direction: Direction | null;
  category_id: string | null;
  suggested_category_id: string | null;
  merchant: string | null;
  note: string;
  image_id: string | null;
  unresolved: string;
  provider: string | null;
  created_at: string;
}

function toCandidate(r: Row): Candidate {
  return {
    id: r.id,
    source: r.source,
    rawInput: r.raw_input,
    date: r.date,
    amount: r.amount,
    direction: r.direction,
    categoryId: r.category_id,
    merchant: r.merchant,
    note: r.note,
    imageId: r.image_id,
    unresolved: JSON.parse(r.unresolved) as UnresolvedField[],
    providerName: r.provider,
    createdAt: r.created_at,
  };
}

export interface CandidateDraft {
  source: CandidateSource;
  rawInput: string;
  date?: string | null;
  amount?: number | null;
  direction?: Direction | null;
  categoryId?: string | null;
  merchant?: string | null;
  note?: string;
  imageId?: string | null;
  unresolved: UnresolvedField[];
  providerName?: string | null;
}

/** 미확정 항목을 값에서 다시 계산한다. 저장 전에 항상 이것을 거친다. */
export function computeUnresolved(d: {
  date?: string | null;
  amount?: number | null;
  direction?: Direction | null;
  categoryId?: string | null;
}): UnresolvedField[] {
  const out: UnresolvedField[] = [];
  if (!d.date) out.push('date');
  if (d.amount === null || d.amount === undefined) out.push('amount');
  if (!d.direction) out.push('direction');
  if (!d.categoryId) out.push('category');
  return out;
}

export function saveCandidates(drafts: CandidateDraft[], db: DatabaseSync = getDb()): Candidate[] {
  const stmt = db.prepare(
    `INSERT INTO candidates (id, source, raw_input, date, amount, direction, category_id,
       suggested_category_id, merchant, note, image_id, unresolved, provider, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ids: string[] = [];
  for (const d of drafts) {
    const id = newId('cand');
    ids.push(id);
    stmt.run(
      id,
      d.source,
      d.rawInput,
      d.date ?? null,
      d.amount ?? null,
      d.direction ?? null,
      d.categoryId ?? null,
      d.categoryId ?? null,
      d.merchant ?? null,
      d.note ?? '',
      d.imageId ?? null,
      JSON.stringify(computeUnresolved(d)),
      d.providerName ?? null,
      nowISO(),
    );
  }
  return ids.map((id) => getCandidate(id, db)!);
}

export function getCandidate(id: string, db: DatabaseSync = getDb()): Candidate | null {
  const r = db.prepare('SELECT * FROM candidates WHERE id = ?').get(id) as unknown as Row | undefined;
  return r ? toCandidate(r) : null;
}

/** 확인을 기다리는 후보. 집계에는 절대 쓰이지 않는다(SDD 불변조건 4). */
export function listCandidates(db: DatabaseSync = getDb()): Candidate[] {
  const rows = db
    .prepare('SELECT * FROM candidates ORDER BY created_at ASC')
    .all() as unknown as Row[];
  return rows.map(toCandidate);
}

export interface CandidatePatch {
  date?: string | null;
  amount?: number | null;
  direction?: Direction | null;
  categoryId?: string | null;
  merchant?: string | null;
  note?: string;
}

/** FR-ENTRY-06 — 확인 전에 각 항목을 고친다. */
export function updateCandidate(
  id: string,
  patch: CandidatePatch,
  db: DatabaseSync = getDb(),
): Candidate | null {
  const cur = getCandidate(id, db);
  if (!cur) return null;
  const next = {
    date: patch.date !== undefined ? patch.date : cur.date,
    amount: patch.amount !== undefined ? patch.amount : cur.amount,
    direction: patch.direction !== undefined ? patch.direction : cur.direction,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : cur.categoryId,
    merchant: patch.merchant !== undefined ? patch.merchant : cur.merchant,
    note: patch.note !== undefined ? patch.note : cur.note,
  };
  db.prepare(
    `UPDATE candidates SET date=?, amount=?, direction=?, category_id=?, merchant=?, note=?, unresolved=?
     WHERE id = ?`,
  ).run(
    next.date,
    next.amount,
    next.direction,
    next.categoryId,
    next.merchant,
    next.note,
    JSON.stringify(computeUnresolved(next)),
    id,
  );
  return getCandidate(id, db);
}

export type ConfirmResult =
  | { ok: true; recordId: string }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'unresolved'; fields: UnresolvedField[] }
  | { ok: false; reason: CreateResult extends { ok: false; reason: infer R } ? R : never };

/**
 * 확인 동작 — 기록 후보가 확정 기록이 되는 유일한 지점(FR-ENTRY-05).
 * 미확정 항목이 남아 있으면 확정하지 않고 무엇이 비었는지 돌려준다.
 */
export function confirmCandidate(id: string, db: DatabaseSync = getDb()): ConfirmResult {
  const c = getCandidate(id, db);
  if (!c) return { ok: false, reason: 'not-found' };

  const missing = computeUnresolved(c).filter((f) => f !== 'category');
  if (missing.length > 0) return { ok: false, reason: 'unresolved', fields: missing };

  const created = createRecord(
    {
      date: c.date!,
      amount: c.amount!,
      direction: c.direction!,
      categoryId: c.categoryId,
      note: c.note,
      merchant: c.merchant,
      imageId: c.imageId,
    },
    db,
  );
  if (!created.ok) return { ok: false, reason: created.reason } as ConfirmResult;

  // FR-CAT-07 — 사용자가 제안된 분류를 바꿨다면 그 사실을 거래 대상과 함께 남긴다.
  const row = db.prepare('SELECT suggested_category_id FROM candidates WHERE id = ?').get(id) as
    | { suggested_category_id: string | null }
    | undefined;
  const suggested = row?.suggested_category_id ?? null;
  if (c.merchant && c.categoryId && c.categoryId !== suggested) {
    rememberMerchantCategory(c.merchant, c.categoryId, db);
  }

  db.prepare('DELETE FROM candidates WHERE id = ?').run(id);
  return { ok: true, recordId: created.record.id };
}

export function discardCandidate(id: string, db: DatabaseSync = getDb()): { ok: boolean } {
  const c = getCandidate(id, db);
  if (!c) return { ok: false };
  db.prepare('DELETE FROM candidates WHERE id = ?').run(id);
  return { ok: true };
}
