import type { DatabaseSync } from 'node:sqlite';
import { getDb, newId, nowISO } from '../db';
import type { Category, Direction } from '../domain/types';

interface Row {
  id: string;
  name: string;
  direction: Direction;
  sort_order: number;
  seeded: number;
  created_at: string;
  archived_at: string | null;
}

function toCategory(r: Row): Category {
  return {
    id: r.id,
    name: r.name,
    direction: r.direction,
    sortOrder: r.sort_order,
    seeded: r.seeded === 1,
    createdAt: r.created_at,
  };
}

/** 선택지에 오르는 분류(FR-CAT-03: 보관된 것은 빠진다). */
export function listCategories(direction?: Direction, db: DatabaseSync = getDb()): Category[] {
  const rows = direction
    ? (db
        .prepare(
          `SELECT * FROM categories WHERE archived_at IS NULL AND direction = ?
           ORDER BY sort_order, name`,
        )
        .all(direction) as unknown as Row[])
    : (db
        .prepare(
          `SELECT * FROM categories WHERE archived_at IS NULL
           ORDER BY direction DESC, sort_order, name`,
        )
        .all() as unknown as Row[]);
  return rows.map(toCategory);
}

/**
 * 보관된 것까지 포함해 찾는다.
 * 지난 기록이 어느 분류에 속했는지 보여줄 때 쓴다(NFR-CAT-01).
 */
export function getCategory(id: string, db: DatabaseSync = getDb()): Category | null {
  const r = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as unknown as Row | undefined;
  return r ? toCategory(r) : null;
}

export function getCategoryName(id: string | null, db: DatabaseSync = getDb()): string | null {
  if (!id) return null;
  const r = db.prepare('SELECT name FROM categories WHERE id = ?').get(id) as
    | { name: string }
    | undefined;
  return r?.name ?? null;
}

export type AddCategoryResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'duplicate-name' | 'empty-name' };

/** FR-CAT-01 */
export function addCategory(
  name: string,
  direction: Direction,
  db: DatabaseSync = getDb(),
): AddCategoryResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'empty-name' };
  const dup = db
    .prepare(
      'SELECT id FROM categories WHERE archived_at IS NULL AND direction = ? AND name = ?',
    )
    .get(direction, trimmed);
  if (dup) return { ok: false, reason: 'duplicate-name' };

  const maxRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE direction = ?')
    .get(direction) as { m: number };
  const id = newId('cat');
  db.prepare(
    `INSERT INTO categories (id, name, direction, sort_order, seeded, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
  ).run(id, trimmed, direction, maxRow.m + 1, nowISO());
  return { ok: true, category: getCategory(id, db)! };
}

export type RenameResult = { ok: true } | { ok: false; reason: 'not-found' | 'duplicate-name' | 'empty-name' };

/** FR-CAT-02 — 식별자와 귀속 기록을 유지한 채 이름만 바꾼다. */
export function renameCategory(id: string, name: string, db: DatabaseSync = getDb()): RenameResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: 'empty-name' };
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as unknown as Row | undefined;
  if (!cur || cur.archived_at) return { ok: false, reason: 'not-found' };
  const dup = db
    .prepare(
      'SELECT id FROM categories WHERE archived_at IS NULL AND direction = ? AND name = ? AND id <> ?',
    )
    .get(cur.direction, trimmed, id);
  if (dup) return { ok: false, reason: 'duplicate-name' };
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmed, id);
  return { ok: true };
}

export function countRecordsInCategory(id: string, db: DatabaseSync = getDb()): number {
  const r = db
    .prepare('SELECT COUNT(*) AS n FROM records WHERE category_id = ? AND deleted_at IS NULL')
    .get(id) as { n: number };
  return r.n;
}

export type DeleteCategoryResult =
  | { ok: true; archived: boolean }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'has-records'; recordCount: number };

/**
 * FR-CAT-03 / FR-CAT-08.
 * 귀속된 기록이 있으면 confirmed 없이는 수행하지 않는다.
 * 수행하더라도 행을 지우지 않고 보관 처리한다 — 지우면 NFR-CAT-01 이 깨진다.
 */
export function deleteCategory(
  id: string,
  opts: { confirmed?: boolean } = {},
  db: DatabaseSync = getDb(),
): DeleteCategoryResult {
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as unknown as Row | undefined;
  if (!cur || cur.archived_at) return { ok: false, reason: 'not-found' };

  const n = countRecordsInCategory(id, db);
  if (n > 0 && !opts.confirmed) return { ok: false, reason: 'has-records', recordCount: n };

  db.prepare('UPDATE categories SET archived_at = ? WHERE id = ?').run(nowISO(), id);
  return { ok: true, archived: true };
}

export function reorderCategories(ids: string[], db: DatabaseSync = getDb()): void {
  const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
  ids.forEach((id, i) => stmt.run(i, id));
}

/** 자동 배정이 고를 수 있는 분류 식별자 집합(FR-CAT-06 의 경계). */
export function allowedCategoryIds(direction: Direction, db: DatabaseSync = getDb()): Set<string> {
  return new Set(listCategories(direction, db).map((c) => c.id));
}
