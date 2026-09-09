import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { getDb, imagePath, imagesDir, nowISO } from '../db';
import type { Direction } from '../domain/types';
import { isISODate } from '../domain/date';

/**
 * 반출·반입 — FR-VIEW-10 / FR-VIEW-11 / NFR-VIEW-03, ADR-008.
 *
 * 기록과 근거 이미지를 **한 묶음**으로 담는다. 저장은 두 곳으로 나뉘어 있지만(ADR-007)
 * 묶지 않으면 "반출 파일만으로 복원"이 이미지에 대해 성립하지 않는다.
 */

export const BUNDLE_VERSION = 1;

export interface Bundle {
  format: 'expense-tracker-bundle';
  version: number;
  exportedAt: string;
  categories: {
    id: string;
    name: string;
    direction: Direction;
    sortOrder: number;
    archivedAt: string | null;
  }[];
  records: {
    id: string;
    date: string;
    amount: number;
    direction: Direction;
    categoryId: string | null;
    note: string;
    merchant: string | null;
    imageId: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  }[];
  budgets: { categoryId: string; periodKey: string; amount: number }[];
  recurring: {
    id: string;
    name: string;
    amount: number;
    direction: Direction;
    categoryId: string | null;
    note: string;
    merchant: string | null;
    anchorDay: number;
    active: boolean;
  }[];
  merchantRules: { merchant: string; categoryId: string; updatedAt: string }[];
  images: { id: string; mime: string; bytes: number; base64: string }[];
}

export interface ExportOptions {
  /** 이미지를 함께 담는다. 끄면 NFR-VIEW-03(파일만으로 복원)이 이미지에 대해 성립하지 않는다. */
  includeImages?: boolean;
}

export function exportBundle(opts: ExportOptions = {}, db: DatabaseSync = getDb()): Bundle {
  const includeImages = opts.includeImages !== false;

  const categories = db
    .prepare(
      'SELECT id, name, direction, sort_order AS sortOrder, archived_at AS archivedAt FROM categories ORDER BY direction, sort_order',
    )
    .all() as unknown as Bundle['categories'];

  const records = db
    .prepare(
      `SELECT id, date, amount, direction, category_id AS categoryId, note, merchant,
              image_id AS imageId, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
       FROM records ORDER BY date, created_at`,
    )
    .all() as unknown as Bundle['records'];

  const budgets = db
    .prepare('SELECT category_id AS categoryId, period_key AS periodKey, amount FROM budgets')
    .all() as unknown as Bundle['budgets'];

  const recurringRows = db
    .prepare(
      `SELECT id, name, amount, direction, category_id AS categoryId, note, merchant,
              anchor_day AS anchorDay, active FROM recurring`,
    )
    .all() as unknown as (Omit<Bundle['recurring'][number], 'active'> & { active: number })[];
  const recurring = recurringRows.map((r) => ({ ...r, active: r.active === 1 }));

  const merchantRules = db
    .prepare('SELECT merchant, category_id AS categoryId, updated_at AS updatedAt FROM merchant_rules')
    .all() as unknown as Bundle['merchantRules'];

  const images: Bundle['images'] = [];
  if (includeImages) {
    const rows = db
      .prepare('SELECT id, rel_path AS relPath, mime, bytes FROM images')
      .all() as unknown as { id: string; relPath: string; mime: string; bytes: number }[];
    for (const r of rows) {
      const abs = imagePath(r.relPath);
      try {
        images.push({ id: r.id, mime: r.mime, bytes: r.bytes, base64: fs.readFileSync(abs).toString('base64') });
      } catch {
        // 파일이 사라진 이미지는 담지 않는다. 기록 자체는 그대로 반출된다.
      }
    }
  }

  return {
    format: 'expense-tracker-bundle',
    version: BUNDLE_VERSION,
    exportedAt: nowISO(),
    categories,
    records,
    budgets,
    recurring,
    merchantRules,
    images,
  };
}

export type ImportResult =
  | {
      ok: true;
      imported: number;
      /** 이미 있는 식별자라 건너뛴 수(SRS S-08: 기존 기록을 갱신하지 않는다). */
      skipped: number;
      categoriesAdded: number;
      imagesRestored: number;
    }
  | { ok: false; reason: 'bad-format'; detail: string };

function isBundle(v: unknown): v is Bundle {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    b.format === 'expense-tracker-bundle' &&
    typeof b.version === 'number' &&
    Array.isArray(b.records) &&
    Array.isArray(b.categories)
  );
}

/**
 * FR-VIEW-11.
 * 형식이 맞지 않으면 아무것도 바꾸지 않는다. 겹치는 기록은 갱신하지 않고 건너뛴다.
 */
export function importBundle(raw: unknown, db: DatabaseSync = getDb()): ImportResult {
  if (!isBundle(raw)) return { ok: false, reason: 'bad-format', detail: '형식이 맞지 않습니다' };
  if (raw.version > BUNDLE_VERSION)
    return { ok: false, reason: 'bad-format', detail: '더 새로운 형식입니다' };

  let imported = 0;
  let skipped = 0;
  let categoriesAdded = 0;
  let imagesRestored = 0;

  db.exec('BEGIN');
  try {
    const catExists = db.prepare('SELECT 1 AS x FROM categories WHERE id = ?');
    const catInsert = db.prepare(
      `INSERT INTO categories (id, name, direction, sort_order, seeded, created_at, archived_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    );
    for (const c of raw.categories ?? []) {
      if (catExists.get(c.id)) continue;
      // 이름이 겹치면 살아 있는 쪽을 지키기 위해 보관 상태로 들여온다.
      const dup = db
        .prepare('SELECT 1 AS x FROM categories WHERE archived_at IS NULL AND direction = ? AND name = ?')
        .get(c.direction, c.name);
      catInsert.run(
        c.id,
        c.name,
        c.direction,
        c.sortOrder ?? 0,
        nowISO(),
        c.archivedAt ?? (dup ? nowISO() : null),
      );
      categoriesAdded++;
    }

    const imgExists = db.prepare('SELECT 1 AS x FROM images WHERE id = ?');
    const imgInsert = db.prepare(
      'INSERT INTO images (id, rel_path, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (const im of raw.images ?? []) {
      if (imgExists.get(im.id)) continue;
      const ext = im.mime === 'image/png' ? 'png' : im.mime === 'image/webp' ? 'webp' : 'jpg';
      const rel = `${im.id}.${ext}`;
      fs.mkdirSync(imagesDir(), { recursive: true });
      fs.writeFileSync(imagePath(rel), Buffer.from(im.base64, 'base64'));
      imgInsert.run(im.id, rel, im.mime, im.bytes, nowISO());
      imagesRestored++;
    }

    const recExists = db.prepare('SELECT 1 AS x FROM records WHERE id = ?');
    const recInsert = db.prepare(
      `INSERT INTO records (id, date, amount, direction, category_id, note, merchant, image_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of raw.records ?? []) {
      if (!isISODate(r.date) || !Number.isInteger(r.amount) || r.amount <= 0) {
        skipped++;
        continue;
      }
      if (recExists.get(r.id)) {
        skipped++;
        continue;
      }
      recInsert.run(
        r.id,
        r.date,
        r.amount,
        r.direction,
        r.categoryId ?? null,
        r.note ?? '',
        r.merchant ?? null,
        r.imageId ?? null,
        r.createdAt ?? nowISO(),
        r.updatedAt ?? nowISO(),
        r.deletedAt ?? null,
      );
      imported++;
    }

    for (const b of raw.budgets ?? []) {
      db.prepare(
        `INSERT INTO budgets (id, category_id, period_key, amount) VALUES (?, ?, ?, ?)
         ON CONFLICT(category_id, period_key) DO NOTHING`,
      ).run(`bud_imp_${b.categoryId}_${b.periodKey}`, b.categoryId, b.periodKey, b.amount);
    }

    for (const r of raw.recurring ?? []) {
      db.prepare(
        `INSERT OR IGNORE INTO recurring (id, name, amount, direction, category_id, note, merchant, anchor_day, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        r.id,
        r.name,
        r.amount,
        r.direction,
        r.categoryId ?? null,
        r.note ?? '',
        r.merchant ?? null,
        r.anchorDay,
        r.active ? 1 : 0,
        nowISO(),
      );
    }

    for (const m of raw.merchantRules ?? []) {
      db.prepare(
        `INSERT INTO merchant_rules (merchant, category_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(merchant) DO NOTHING`,
      ).run(m.merchant, m.categoryId, m.updatedAt ?? nowISO());
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return { ok: false, reason: 'bad-format', detail: (e as Error).message };
  }

  return { ok: true, imported, skipped, categoriesAdded, imagesRestored };
}

/**
 * 표 계산 도구에서 열어 보기 위한 CSV.
 * 복원용 형식이 아니다 — 복원은 위의 묶음이 담당한다(NFR-VIEW-03).
 */
export function exportCsv(db: DatabaseSync = getDb()): string {
  const rows = db
    .prepare(
      `SELECT r.date, r.direction, r.amount, COALESCE(c.name,'') AS category, r.merchant, r.note
       FROM records r LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.deleted_at IS NULL ORDER BY r.date, r.created_at`,
    )
    .all() as unknown as {
    date: string;
    direction: Direction;
    amount: number;
    category: string;
    merchant: string | null;
    note: string;
  }[];

  const esc = (s: string): string => `"${String(s).replace(/"/g, '""')}"`;
  const head = ['날짜', '구분', '금액', '분류', '거래처', '내용'].join(',');
  const body = rows.map((r) =>
    [
      r.date,
      r.direction === 'income' ? '수입' : '지출',
      String(r.amount),
      esc(r.category),
      esc(r.merchant ?? ''),
      esc(r.note),
    ].join(','),
  );
  // 표 계산 도구가 한글을 깨뜨리지 않게 BOM 을 붙인다.
  return '﻿' + [head, ...body].join('\r\n');
}
