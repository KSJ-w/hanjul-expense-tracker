import type {
  InterpretInput,
  InterpretOutcome,
  InterpretProvider,
  InterpretedItem,
  QueryInput,
  QueryOutcome,
} from './types';
import { findAmounts } from '../domain/money';
import { detectDate, detectDirection, detectMerchant, directionIsExplicit, splitSegments } from './korean';
import { guessCategoryId } from './categoryHint';
import { parseQuery } from './queryRules';
import { lookupMerchantCategory } from '../repo/merchantRules';

/**
 * 기기 안에서만 도는 규칙 기반 해석 수단.
 *
 * 두 가지 역할을 한다.
 *  1) 외부 수단을 붙이기 전까지 제품 전체가 동작하고 검증되게 한다.
 *  2) 외부 수단을 쓸 수 없을 때의 경로가 된다(FR-ENTRY-14, 원칙 3).
 *
 * 밖으로 아무것도 내보내지 않는다.
 */
export const heuristicProvider: InterpretProvider = {
  name: 'heuristic-local',
  usesNetwork: false,
  isAvailable: () => true,

  /** 조회 문장도 기기 안 규칙으로 읽는다(FR-VIEW-13). 밖으로 나가는 것이 없다. */
  async interpretQuery(input: QueryInput): Promise<QueryOutcome> {
    const started = Date.now();
    const { parts } = parseQuery(input.text, input.today, input.categories);
    return {
      parts,
      providerName: heuristicProvider.name,
      degraded: false,
      // 조건을 하나도 알아듣지 못한 것은 '실패'다 — 조건 없는 전체 목록을
      // 결과인 것처럼 내놓지 않기 위해 그 사실을 값으로 남긴다(US-08-01 수용 조건 6).
      failure: parts.length === 0 ? 'unparseable' : undefined,
      elapsedMs: Date.now() - started,
    };
  },

  async interpret(input: InterpretInput): Promise<InterpretOutcome> {
    const started = Date.now();

    // 이미지는 이 수단이 읽지 못한다. 못 읽었다는 사실을 그대로 알린다 —
    // "그 이미지에 기록할 것이 없다"는 뜻이 아니다(SRS §6).
    if (input.image && !input.text) {
      return {
        items: [],
        providerName: heuristicProvider.name,
        degraded: false,
        failure: 'unparseable',
        elapsedMs: Date.now() - started,
      };
    }

    const text = (input.text ?? '').trim();
    if (!text) {
      return {
        items: [],
        providerName: heuristicProvider.name,
        degraded: false,
        failure: 'unparseable',
        elapsedMs: Date.now() - started,
      };
    }

    // 문장 전체에 걸리는 날짜(맨 앞의 "어제" 등)는 모든 조각에 적용한다.
    const globalDate = detectDate(text, input.today);
    const segments = splitSegments(text);

    const items: InterpretedItem[] = segments.map((seg) => {
      const amounts = findAmounts(seg);
      const amount = amounts.length > 0 ? amounts[0] : null;
      const localDate = detectDate(seg, input.today);
      const dateMatch = localDate ?? globalDate;

      // 방향은 조각 안에서만 판정한다.
      // "커피 2만원 쓰고, 용돈 5만원 받았어" 처럼 한 입력에 방향이 섞이면
      // 문장 전체를 보고 판정할 경우 뒤쪽의 "받았어"가 앞 거래까지 수입으로 만든다.
      // 조각에 근거가 없을 때만, 그리고 조각이 하나뿐일 때만 문장 전체를 본다.
      const direction = directionIsExplicit(seg)
        ? detectDirection(seg)
        : segments.length === 1 && directionIsExplicit(text)
          ? detectDirection(text)
          : 'expense';

      const merchant = detectMerchant(seg, amount, localDate);
      const categoryId =
        lookupMerchantCategory(merchant) ?? guessCategoryId(seg, direction, input.categories);

      return {
        date: dateMatch ? dateMatch.date : input.today,
        amount: amount ? amount.value : null,
        direction,
        categoryId,
        merchant,
        note: seg,
      };
    });

    const usable = items.filter((i) => i.amount !== null);
    return {
      items: usable.length > 0 ? items : items, // 금액이 없어도 후보로 낸다 — 사람이 이어받는다
      providerName: heuristicProvider.name,
      degraded: false,
      failure: usable.length === 0 ? 'unparseable' : undefined,
      elapsedMs: Date.now() - started,
    };
  },
};
