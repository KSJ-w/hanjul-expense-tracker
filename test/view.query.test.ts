/**
 * VIEW — 한 줄로 적은 조회 요청(FR-VIEW-13, ADR-040).
 *
 * 규칙 기반 해석은 순수 함수라 값으로 판정할 수 있다. 외부 수단은 같은 계약
 * (`QueryOutcome`)을 돌려주므로, 여기서 못 박는 것은 **계약의 모양**이기도 하다:
 * 조건과 **알아들은 조건의 목록**이 늘 함께 온다.
 */
import { describe, it, expect } from 'vitest';
import { parseQuery } from '@/lib/interpret/queryRules';
import type { Category } from '@/lib/domain/types';

const TODAY = '2026-09-11';

/** 이름과 방향만 쓰므로 나머지는 최소로 채운다. */
const cat = (id: string, name: string): Category => ({
  id,
  name,
  direction: 'expense',
  sortOrder: 0,
  seeded: false,
  createdAt: '2026-01-01',
});

const cats: Category[] = [cat('c_cafe', '카페/간식'), cat('c_food', '식비')];

/** 한 몫만 나오는 문장을 짧게 보기 위한 도우미. */
const one = (text: string) => parseQuery(text, TODAY, cats).parts[0] ?? { label: '', query: {}, terms: [] };
const partsOf = (text: string) => parseQuery(text, TODAY, cats).parts;
const keys = (text: string) => one(text).terms.map((t) => t.key);

describe('VIEW 조회 문장 해석', () => {
  it('[TC-VIEW-50] FR-VIEW-13: 기간·방향·금액·태그·내용을 조건으로 바꾸고 알아들은 것을 함께 돌려준다', () => {
    /* ① 기간 — 상대적인 말은 오늘을 기준으로 두 날짜가 된다. */
    expect(one('지난달').query).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    expect(one('이번 달').query).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(one('어제').query).toMatchObject({ from: '2026-09-10', to: '2026-09-10' });
    expect(one('작년').query).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
    // 해가 없는 '8월'은 올해다. 해가 있으면 그 해다.
    expect(one('8월').query).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    expect(one('2025년 2월').query).toMatchObject({ from: '2025-02-01', to: '2025-02-28' });

    /* ② 방향 */
    expect(one('지난달 쓴 거').query.direction).toBe('expense');
    expect(one('지난달 들어온 돈').query.direction).toBe('income');

    /* ③ 금액 — **비교하는 말이 붙어 있을 때만** 조건이다. */
    expect(one('3만원 이상').query.amountMin).toBe(30000);
    expect(one('5천원 미만').query.amountMax).toBe(5000);
    // 그냥 금액만 적은 것은 금액 조건이 아니다 — 내용에 금액을 적어 두는 사람이 있다.
    expect(one('8500원').query.amountMin).toBeUndefined();

    /* ④ 태그 — 긴 이름을 먼저 본다. '식비'가 '카페/간식'을 가로채면 안 된다. */
    expect(one('카페/간식 얼마 썼지').query.categoryId).toBe('c_cafe');
    expect(one('식비 얼마 썼지').query.categoryId).toBe('c_food');

    /* ⑤ 한 문장에 여럿 — 그리고 알아들은 것이 모두 목록에 남는다. */
    const many = one('지난달 카페/간식에서 3만원 넘게 쓴 거');
    expect(many.query).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
      categoryId: 'c_cafe',
      amountMin: 30000,
      direction: 'expense',
    });
    expect(new Set(many.terms.map((t) => t.key))).toEqual(new Set(['period', 'category', 'amount', 'direction']));

    /*
     * ⑥ 알아들은 낱말은 문장에서 **덜어 낸다.** 덜어 내지 않으면 '지난달'이
     * 내용 검색어로도 들어가 아무것도 찾지 못한다 — 그 낱말이 적힌 기록은 없다.
     */
    expect(many.query.text).toBeUndefined();
  });

  it('[TC-VIEW-52] FR-VIEW-13: 나눠 달라고 하면 조회가 몫마다 하나씩 나온다', () => {
    /*
     * "지출과 수입 따로"는 **한 번 묻고 두 번 조회**하는 일이다. 합쳐서 한 목록으로
     * 내놓으면 사용자가 말한 '따로'를 화면이 되돌려 버린다(ADR-042).
     */
    const split = partsOf('이번달 지출과 수입 따로 보여줘');
    expect(split).toHaveLength(2);
    expect(split.map((p) => p.label)).toEqual(['지출', '수입']);
    expect(split[0].query).toMatchObject({ from: '2026-09-01', to: '2026-09-30', direction: 'expense' });
    expect(split[1].query).toMatchObject({ from: '2026-09-01', to: '2026-09-30', direction: 'income' });
    /*
     * 방향 낱말은 조건이 되지 않더라도 문장에서 **덜어 낸다.** 덜어 내지 않으면
     * '지출과 수입'이 통째로 내용 검색어가 되어 두 몫이 다 0 건이 된다(실제로 겪음).
     */
    for (const p of split) expect(p.query.text).toBeUndefined();

    /*
     * '따로'가 없어도 **수입과 지출을 둘 다 말하면** 나눈다. 그러지 않으면 먼저
     * 걸리는 한쪽만 조건이 되어 사용자가 말한 절반이 조용히 사라진다.
     */
    expect(partsOf('지난달 지출 수입')).toHaveLength(2);

    // 나누라고 한 것은 방향이지 기간이 아니다 — 나머지 조건은 두 몫이 함께 쓴다.
    const withTag = partsOf('지난달 식비 각각');
    expect(withTag).toHaveLength(2);
    for (const p of withTag) expect(p.query.categoryId).toBe('c_food');

    // 한쪽만 말하면 나누지 않는다. 그때는 이름도 붙지 않는다.
    const single = partsOf('이번 달 지출');
    expect(single).toHaveLength(1);
    expect(single[0].label).toBe('');
  });

  it('[TC-VIEW-51] FR-VIEW-13: 알아들은 조건이 하나도 없으면 조건이 비고 그 사실이 값으로 남는다', () => {
    /*
     * 이것이 '조건 없는 전체 목록'과 갈리는 지점이다. terms 가 비어 있다는 것이
     * "아무것도 알아듣지 못했다"는 뜻이고, 화면은 그때 결과를 내놓지 않는다
     * (US-08-01 수용 조건 6).
     */
    const nothing = one('내역 보여줘');
    expect(partsOf('내역 보여줘')).toEqual([]);
    expect(nothing.terms).toEqual([]);
    expect(nothing.query).toEqual({});

    // 꼬리말만 적힌 문장이 내용 검색어가 되지 않는다.
    expect(one('찾아줘').query.text).toBeUndefined();
    expect(partsOf('  ')).toEqual([]);

    /*
     * '사용'은 지출이고 '내역'은 꼬리말이다. 이 둘을 모르면 남은 말이 내용
     * 검색어가 되어 **0 건**이 나온다(실제로 겪음 — '이번달 사용 내역').
     */
    const used = one('이번달 사용 내역');
    expect(used.query).toMatchObject({ from: '2026-09-01', to: '2026-09-30', direction: 'expense' });
    expect(used.query.text).toBeUndefined();

    /*
     * 말하듯 적은 문장 — 풀이말의 꼬리를 떼면 기록에 적혔을 낱말 하나가 남는다.
     * 남은 것을 통째로 검색어로 삼던 때에는 `내용 "학식먹었어 먹었면 어"` 가 되어
     * **반드시 0 건**이었다(실제로 겪음). 있는 것을 못 찾은 것이 아니라 찾을 수
     * 없는 것을 만들어 낸 것이다.
     */
    const asked = one('이번주에 학식먹었어? 먹었다면 얼마썼어?');
    expect(asked.query.text).toBe('학식');
    expect(asked.query.direction).toBe('expense');
    expect(asked.query.from).toBeDefined();

    /*
     * 기록에 적혔을 말이 여럿 남으면 **검색어를 두지 않는다.** 규칙으로는 무엇이
     * 그 말인지 가릴 수 없고, 잘못 고르면 0 건을 만들어 낸다 — 기간과 방향만으로
     * 찾아 주는 편이 낫다.
     */
    const vague = one('이번주 스타벅스 투썸 어디');
    expect(vague.query.text).toBeUndefined();
    expect(vague.query.from).toBeDefined();

    // 조건으로 설명되지 않는 낱말은 내용 검색어가 된다 — 그것도 '알아들은 것'이다.
    const note = one('스타벅스');
    expect(note.query.text).toBe('스타벅스');
    expect(keys('스타벅스')).toEqual(['text']);
    expect(note.terms[0].label).toContain('스타벅스');
  });
});
