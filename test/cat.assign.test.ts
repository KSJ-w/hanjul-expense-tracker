/**
 * CAT — 자동 배정의 경계와 학습.
 * 핵심 금지 요구: 보유하지 않은 분류를 만들어 배정하지 않는다(FR-CAT-06).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, cleanup, categoryIdByName, interpretText, TODAY, type TestEnv } from './helpers';
import { listCategories, renameCategory, deleteCategory } from '@/lib/repo/categories';
import { computeUnresolved, saveCandidates, updateCandidate, confirmCandidate } from '@/lib/repo/candidates';

let env: TestEnv;
beforeEach(() => {
  env = freshDb();
});
afterEach(() => cleanup(env));

/** 후보를 만들고 사용자가 분류를 바꿔 확인하는 흐름. FR-CAT-07 의 전제. */
function confirmWithCategory(merchant: string, suggested: string | null, chosen: string) {
  const [c] = saveCandidates(
    [
      {
        source: 'text',
        rawInput: `${merchant} 8000원`,
        date: TODAY,
        amount: 8000,
        direction: 'expense',
        categoryId: suggested,
        merchant,
        note: `${merchant} 8000원`,
        unresolved: [],
      },
    ],
    env.db,
  );
  updateCandidate(c.id, { categoryId: chosen }, env.db);
  const r = confirmCandidate(c.id, env.db);
  if (!r.ok) throw new Error('전제 실패: 확인이 되지 않았다');
}

describe('CAT 자동 배정', () => {
  it('[TC-CAT-13] FR-CAT-06: 맞는 분류가 없으면 미확정으로 남는다', async () => {
    const r = await interpretText('알수없는지출항목 5000원', env.db);
    expect(r.items[0].categoryId).toBeNull();
    expect(computeUnresolved(r.items[0])).toContain('category');
  });

  it('[TC-CAT-14] FR-CAT-06: 배정된 분류는 모두 보유 분류 안에 있다', async () => {
    const owned = new Set(listCategories(undefined, env.db).map((c) => c.id));
    const inputs = [
      '점심 8000원',
      '커피 4500원',
      '택시 12000원',
      '월급 300만원 들어옴',
      '병원 15000원',
      '영화 14000원',
      '이상한말 1000원',
    ];
    for (const text of inputs) {
      const r = await interpretText(text, env.db);
      for (const item of r.items) {
        if (item.categoryId !== null) expect(owned.has(item.categoryId)).toBe(true);
      }
    }
  });

  it('[TC-CAT-15] FR-CAT-06: 분류 이름을 모두 바꿔도 없는 분류를 만들지 않는다', async () => {
    const owned = listCategories(undefined, env.db);
    owned.forEach((c, i) => renameCategory(c.id, `분류${i}`, env.db));
    const ids = new Set(listCategories(undefined, env.db).map((c) => c.id));

    const r = await interpretText('점심 8000원', env.db);
    const assigned = r.items[0].categoryId;
    expect(assigned === null || ids.has(assigned)).toBe(true);
  });

  it('[TC-CAT-16] FR-CAT-07: 고쳐 준 분류가 같은 거래 대상에 반영된다', async () => {
    const cafe = categoryIdByName('카페/간식', env.db);
    confirmWithCategory('김밥천국', categoryIdByName('식비', env.db), cafe);

    const r = await interpretText('김밥천국 8000원', env.db);
    expect(r.items[0].categoryId).toBe(cafe);
  });

  it('[TC-CAT-17] FR-CAT-07: 두 번 고치면 마지막 것이 쓰인다', async () => {
    const cafe = categoryIdByName('카페/간식', env.db);
    const transport = categoryIdByName('교통', env.db);
    confirmWithCategory('김밥천국', categoryIdByName('식비', env.db), cafe);
    confirmWithCategory('김밥천국', cafe, transport);

    const r = await interpretText('김밥천국 8000원', env.db);
    expect(r.items[0].categoryId).toBe(transport);
  });

  it('[TC-CAT-18] FR-CAT-07, FR-CAT-06: 학습된 분류가 보관되면 그것을 배정하지 않는다', async () => {
    const cafe = categoryIdByName('카페/간식', env.db);
    confirmWithCategory('김밥천국', categoryIdByName('식비', env.db), cafe);
    deleteCategory(cafe, { confirmed: true }, env.db);

    const r = await interpretText('김밥천국 8000원', env.db);
    expect(r.items[0].categoryId).not.toBe(cafe);
  });
});
