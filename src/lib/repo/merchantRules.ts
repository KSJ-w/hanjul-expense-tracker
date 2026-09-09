import type { DatabaseSync } from 'node:sqlite';
import { getDb, nowISO } from '../db';

/**
 * FR-CAT-07 의 판정 근거.
 * 판정은 거래 대상 문자열의 **완전 일치**다(RFP R-01 / SRS §1.4).
 * 부분 일치는 오배정 위험이 있어 채택하지 않았다.
 * 정규화는 앞뒤 공백 제거와 대소문자 통일까지만 한다 — 그 이상은 '완전 일치'가 아니게 된다.
 */
export function normalizeMerchant(s: string): string {
  return s.trim().toLowerCase();
}

export function rememberMerchantCategory(
  merchant: string,
  categoryId: string,
  db: DatabaseSync = getDb(),
): void {
  const key = normalizeMerchant(merchant);
  if (!key) return;
  db.prepare(
    `INSERT INTO merchant_rules (merchant, category_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(merchant) DO UPDATE SET category_id = excluded.category_id, updated_at = excluded.updated_at`,
  ).run(key, categoryId, nowISO());
}

/** 보관된 분류를 가리키는 규칙은 무시한다 — 선택지에 없는 분류를 배정하면 FR-CAT-06 위반이다. */
export function lookupMerchantCategory(
  merchant: string | null | undefined,
  db: DatabaseSync = getDb(),
): string | null {
  if (!merchant) return null;
  const r = db
    .prepare(
      `SELECT m.category_id AS id FROM merchant_rules m
       JOIN categories c ON c.id = m.category_id
       WHERE m.merchant = ? AND c.archived_at IS NULL`,
    )
    .get(normalizeMerchant(merchant)) as { id: string } | undefined;
  return r?.id ?? null;
}

export function listMerchantRules(
  db: DatabaseSync = getDb(),
): { merchant: string; categoryId: string; updatedAt: string }[] {
  return db
    .prepare(
      'SELECT merchant, category_id AS categoryId, updated_at AS updatedAt FROM merchant_rules ORDER BY updated_at DESC',
    )
    .all() as unknown as { merchant: string; categoryId: string; updatedAt: string }[];
}

export function forgetMerchantRule(merchant: string, db: DatabaseSync = getDb()): void {
  db.prepare('DELETE FROM merchant_rules WHERE merchant = ?').run(normalizeMerchant(merchant));
}
