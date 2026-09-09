import type { DatabaseSync } from 'node:sqlite';
import { getDb, newId } from '../db';
import { endOfMonth } from '../domain/date';
import { categoryBreakdown } from './records';

/**
 * 예산 — FR-VIEW-08 / FR-VIEW-09.
 * 예산의 부재와 금액 0 은 서로 다른 상태다(SRS §7). 부재를 초과로 표시하면 안 된다.
 */

export interface BudgetRow {
  id: string;
  categoryId: string;
  periodKey: string;
  amount: number;
}

export function setBudget(
  categoryId: string,
  periodKey: string,
  amount: number,
  db: DatabaseSync = getDb(),
): { ok: boolean; reason?: 'invalid-amount' | 'invalid-period' } {
  if (!Number.isInteger(amount) || amount < 0) return { ok: false, reason: 'invalid-amount' };
  if (!/^\d{4}-\d{2}$/.test(periodKey)) return { ok: false, reason: 'invalid-period' };
  db.prepare(
    `INSERT INTO budgets (id, category_id, period_key, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(category_id, period_key) DO UPDATE SET amount = excluded.amount`,
  ).run(newId('bud'), categoryId, periodKey, amount);
  return { ok: true };
}

export function clearBudget(categoryId: string, periodKey: string, db: DatabaseSync = getDb()): void {
  db.prepare('DELETE FROM budgets WHERE category_id = ? AND period_key = ?').run(
    categoryId,
    periodKey,
  );
}

export function listBudgets(periodKey: string, db: DatabaseSync = getDb()): BudgetRow[] {
  return db
    .prepare(
      'SELECT id, category_id AS categoryId, period_key AS periodKey, amount FROM budgets WHERE period_key = ?',
    )
    .all(periodKey) as unknown as BudgetRow[];
}

export interface BudgetComparison {
  categoryId: string;
  /** null 이면 예산이 설정되지 않은 상태다. 0 과 구분된다. */
  budget: number | null;
  spent: number;
  /** 예산이 없으면 null. 초과 여부를 판단해서는 안 된다. */
  remaining: number | null;
  ratio: number | null;
}

/**
 * FR-VIEW-09 — 예산이 저장된 분류·기간에 대해 예산과 같은 기간의 지출 합계를 함께 돌려준다.
 * 예산이 없는 분류도 지출과 함께 돌려주되 budget 을 null 로 둔다.
 */
export function budgetComparison(
  periodKey: string,
  db: DatabaseSync = getDb(),
): BudgetComparison[] {
  const from = `${periodKey}-01`;
  const to = endOfMonth(from);
  const spentByCat = new Map<string, number>();
  for (const s of categoryBreakdown(from, to, 'expense', db)) {
    if (s.categoryId) spentByCat.set(s.categoryId, s.amount);
  }
  const budgets = new Map(listBudgets(periodKey, db).map((b) => [b.categoryId, b.amount]));

  const ids = new Set<string>([...spentByCat.keys(), ...budgets.keys()]);
  const out: BudgetComparison[] = [];
  for (const id of ids) {
    const budget = budgets.has(id) ? budgets.get(id)! : null;
    const spent = spentByCat.get(id) ?? 0;
    out.push({
      categoryId: id,
      budget,
      spent,
      remaining: budget === null ? null : budget - spent,
      ratio: budget === null || budget === 0 ? null : spent / budget,
    });
  }
  return out.sort((a, b) => b.spent - a.spent);
}
