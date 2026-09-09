import type { DatabaseSync } from 'node:sqlite';

/**
 * 처음 켰을 때 들어 있는 분류 — FR-CAT-04, SDD 미결 D-04 의 확정 내용.
 * 전부 사용자가 이름을 바꾸거나 지울 수 있다(FR-CAT-02·FR-CAT-03).
 * 여기를 고치면 SDD D-04 의 결정 칸도 같이 고친다.
 */
export const SEED_EXPENSE_CATEGORIES = [
  '식비',
  '카페/간식',
  '교통',
  '생활용품',
  '주거/통신',
  '의료/건강',
  '문화/여가',
  '의류/미용',
  '경조사',
  '기타',
] as const;

export const SEED_INCOME_CATEGORIES = ['급여', '용돈', '부수입', '기타'] as const;

/**
 * 분류 집합이 비어 있으면 채운다.
 * 사용자가 전부 지운 상태를 되돌리지 않기 위해, '비어 있을 때만' 넣는다 —
 * 지운 것이 되살아나면 FR-CAT-03 이 무의미해진다.
 */
export function seedCategoriesIfEmpty(db: DatabaseSync): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM categories').get() as { n: number };
  if (row.n > 0) return;

  const insert = db.prepare(
    `INSERT INTO categories (id, name, direction, sort_order, seeded, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`,
  );
  const now = new Date().toISOString();
  SEED_EXPENSE_CATEGORIES.forEach((name, i) => {
    insert.run(`cat_seed_e${i}`, name, 'expense', i, now);
  });
  SEED_INCOME_CATEGORIES.forEach((name, i) => {
    insert.run(`cat_seed_i${i}`, name, 'income', i, now);
  });
}
