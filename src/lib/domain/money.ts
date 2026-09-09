/**
 * 금액 — 원 단위 정수만 다룬다(SRS §9 가정: 통화가 하나다).
 * 한국어 표기(만·천·억, 콤마, '원')를 정수로 바꾸는 것이 이 파일의 핵심이다.
 */

const UNIT_ORDER: { token: string; mul: number }[] = [
  { token: '억', mul: 100_000_000 },
  { token: '만', mul: 10_000 },
  { token: '천', mul: 1_000 },
];

/** 금액 후보 한 건의 위치와 값. */
export interface AmountMatch {
  value: number;
  start: number;
  end: number;
  raw: string;
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// 억/만/천이 섞인 표기와 순수 숫자 표기를 모두 잡는다. '원'은 있어도 없어도 된다.
const AMOUNT_RE = new RegExp(
  String.raw`(?:(?:${NUM})?\s*억\s*)?(?:(?:${NUM})?\s*만\s*)?(?:(?:${NUM})?\s*천\s*)?(?:${NUM})?\s*원|` +
    String.raw`(?:(?:${NUM})?\s*억\s*)?(?:(?:${NUM})?\s*만\s*)?(?:(?:${NUM})?\s*천)|` +
    String.raw`${NUM}`,
  'g',
);

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

/**
 * 한국어 금액 표기 한 덩어리를 정수로 바꾼다.
 * "3만5천원" → 35000, "300만원" → 3000000, "천원" → 1000, "8,000" → 8000
 * 값이 0 이하이거나 해석되지 않으면 null.
 */
export function parseAmountToken(token: string): number | null {
  const s = token.replace(/\s+/g, '').replace(/원$/, '');
  if (!s) return null;

  let rest = s;
  let total = 0;
  let sawUnit = false;

  for (const { token: unit, mul } of UNIT_ORDER) {
    const idx = rest.indexOf(unit);
    if (idx === -1) continue;
    const head = rest.slice(0, idx);
    // 단위 앞에 숫자가 없으면 1로 본다: "만원" = 10000
    const n = head === '' ? 1 : toNumber(head);
    if (!Number.isFinite(n)) return null;
    total += n * mul;
    sawUnit = true;
    rest = rest.slice(idx + unit.length);
  }

  if (rest !== '') {
    const n = toNumber(rest);
    if (!Number.isFinite(n)) return sawUnit ? finalize(total) : null;
    total += n;
  }

  return finalize(total);
}

function finalize(total: number): number | null {
  const v = Math.round(total);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * 문장에서 금액으로 보이는 것을 모두 찾는다.
 * 한 입력에 여러 거래가 담겼는지 판단하는 근거가 된다(FR-ENTRY-03).
 */
export function findAmounts(text: string): AmountMatch[] {
  const out: AmountMatch[] = [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const raw = m[0].trim();
    if (!raw) {
      AMOUNT_RE.lastIndex++;
      continue;
    }
    // 날짜로 읽히는 토막은 금액이 아니다: 2026-09-08, 9/8, 9월, 8일
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (/[-/.]/.test(before) || /[-/]/.test(after)) continue;
    if (/^(월|일|년|시|분|개|명|번|층|호)/.test(after) && !/원$/.test(raw)) continue;

    // 단위 글자가 낱말의 일부인 경우를 걸러 낸다.
    // "김밥천국"의 '천', "만나서"의 '만'은 금액이 아니다.
    const hasDigit = /\d/.test(raw);
    const endsWithWon = /원$/.test(raw);
    const HANGUL = /[가-힣]/;
    if (!hasDigit && !endsWithWon) continue; // 단위만 홀로 있는 것은 금액으로 보지 않는다
    if (!endsWithWon && HANGUL.test(after)) continue; // 뒤에 한글이 붙으면 낱말의 일부다
    if (!hasDigit && HANGUL.test(before)) continue; // 앞에 한글이 붙은 단위도 마찬가지

    const value = parseAmountToken(raw);
    if (value === null) continue;
    out.push({ value, start: m.index, end: m.index + m[0].length, raw });
  }
  return out;
}

export function formatKrw(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 부호 있는 표기. 지출은 앞에 −를 붙여 방향이 눈에 먼저 들어오게 한다. */
export function formatSigned(n: number, direction: 'income' | 'expense'): string {
  return `${direction === 'expense' ? '−' : '+'}${n.toLocaleString('ko-KR')}원`;
}
