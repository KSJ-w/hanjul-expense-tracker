import type { DatabaseSync } from 'node:sqlite';
import { getDb, newId, nowISO } from '../db';
import type { Direction, RecurringItem } from '../domain/types';
import { lastDayOfMonth, monthKey, todayISO } from '../domain/date';
import { saveCandidates, type CandidateDraft } from './candidates';

interface Row {
  id: string;
  name: string;
  amount: number;
  direction: Direction;
  category_id: string | null;
  note: string;
  merchant: string | null;
  anchor_day: number;
  active: number;
  created_at: string;
}

function toItem(r: Row): RecurringItem {
  return {
    id: r.id,
    name: r.name,
    amount: r.amount,
    direction: r.direction,
    categoryId: r.category_id,
    note: r.note,
    merchant: r.merchant,
    anchorDay: r.anchor_day,
    active: r.active === 1,
    createdAt: r.created_at,
  };
}

export function listRecurring(db: DatabaseSync = getDb()): RecurringItem[] {
  return (
    db.prepare('SELECT * FROM recurring ORDER BY anchor_day, name').all() as unknown as Row[]
  ).map(toItem);
}

export interface NewRecurringInput {
  name: string;
  amount: number;
  direction: Direction;
  categoryId?: string | null;
  note?: string;
  merchant?: string | null;
  anchorDay: number;
}

export function addRecurring(
  input: NewRecurringInput,
  db: DatabaseSync = getDb(),
): { ok: true; id: string } | { ok: false; reason: 'invalid' } {
  if (!input.name.trim()) return { ok: false, reason: 'invalid' };
  if (!Number.isInteger(input.amount) || input.amount <= 0) return { ok: false, reason: 'invalid' };
  if (!Number.isInteger(input.anchorDay) || input.anchorDay < 1 || input.anchorDay > 31)
    return { ok: false, reason: 'invalid' };
  const id = newId('rec');
  db.prepare(
    `INSERT INTO recurring (id, name, amount, direction, category_id, note, merchant, anchor_day, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).run(
    id,
    input.name.trim(),
    input.amount,
    input.direction,
    input.categoryId ?? null,
    input.note ?? '',
    input.merchant ?? null,
    input.anchorDay,
    nowISO(),
  );
  return { ok: true, id };
}

export function setRecurringActive(id: string, active: boolean, db: DatabaseSync = getDb()): void {
  db.prepare('UPDATE recurring SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function removeRecurring(id: string, db: DatabaseSync = getDb()): void {
  db.prepare('DELETE FROM recurring WHERE id = ?').run(id);
}

/**
 * 그 달에 이 항목이 놓이는 날짜.
 * anchorDay 가 그 달에 없으면(예: 31일, 2월) 그 달의 마지막 날로 당긴다.
 */
export function occurrenceDate(anchorDay: number, monthKeyStr: string): string {
  const y = Number(monthKeyStr.slice(0, 4));
  const m = Number(monthKeyStr.slice(5, 7));
  const day = Math.min(anchorDay, lastDayOfMonth(y, m));
  return `${monthKeyStr}-${String(day).padStart(2, '0')}`;
}

/**
 * FR-ENTRY-12 — 주기와 기준일이 지정하는 날짜가 되면 기록 후보를 낸다(RFP R-02).
 * 확정하지 않는다. 확인 동작을 거쳐야만 기록이 된다(FR-ENTRY-05).
 * 같은 달에 두 번 내지 않기 위해 낸 사실을 남긴다.
 */
export function emitDueRecurring(
  today: string = todayISO(),
  db: DatabaseSync = getDb(),
): { emitted: number } {
  const mk = monthKey(today);
  const items = listRecurring(db).filter((i) => i.active);
  const drafts: CandidateDraft[] = [];
  const marks: { id: string; period: string }[] = [];

  for (const item of items) {
    const due = occurrenceDate(item.anchorDay, mk);
    if (due > today) continue; // 아직 그 날짜가 오지 않았다
    const already = db
      .prepare('SELECT 1 AS x FROM recurring_emissions WHERE recurring_id = ? AND period_key = ?')
      .get(item.id, mk);
    if (already) continue;

    drafts.push({
      source: 'recurring',
      rawInput: item.name,
      date: due,
      amount: item.amount,
      direction: item.direction,
      categoryId: item.categoryId,
      merchant: item.merchant,
      note: item.note || item.name,
      unresolved: [],
      providerName: 'recurring',
    });
    marks.push({ id: item.id, period: mk });
  }

  if (drafts.length > 0) {
    saveCandidates(drafts, db);
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO recurring_emissions (recurring_id, period_key, emitted_at) VALUES (?, ?, ?)',
    );
    for (const m of marks) stmt.run(m.id, m.period, nowISO());
  }
  return { emitted: drafts.length };
}
