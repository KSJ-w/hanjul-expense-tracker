import type { Category, RecordQuery } from '../domain/types';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  lastDayOfMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from '../domain/date';
import { parseAmountToken } from '../domain/money';
import type { QueryPart, QueryTerm } from './types';

/**
 * 조회 문장의 기기 안 규칙 — FR-VIEW-13.
 *
 * "지난달 카페에서 3만원 넘게 쓴 거" 같은 한 줄을 조회 조건으로 바꾼다.
 * 순수 함수만 둔다. 네트워크가 없고, 시험이 값으로 판정할 수 있어야 하기 때문이다.
 *
 * ## 왜 '알아들은 조건'을 따로 돌려주는가
 *
 * 조건만 돌려주면 **알아듣지 못해 비어 있는 것**과 **원래 그 조건이 없는 것**이
 * 값에서 구별되지 않는다. 그러면 화면도 구별해 보여 줄 수 없고, 사용자는
 * '못 찾음'과 '잘못 알아들음'을 가릴 길이 없어 다시 적어 볼 수도 없다
 * (US-08-01 수용 조건 5·6). 그래서 조건과 **그 조건이 어디서 왔는지**를 함께 돌려준다.
 *
 * ## 낱말을 먹는 순서
 *
 * 앞에서 알아들은 낱말은 문장에서 **덜어 낸다.** 남은 것이 '내용 검색어'다.
 * 덜어 내지 않으면 '지난달'이 내용 검색어로도 들어가 아무것도 찾지 못한다
 * (그 낱말이 적힌 기록은 없다).
 */

/** 한 조각을 알아들었을 때의 결과 — 조건의 일부와, 그것을 만든 글자 범위. */
interface Hit {
  term: QueryTerm;
  /** 문장에서 덜어 낼 글자. */
  consumed: string;
  apply: (q: RecordQuery) => void;
}

const MONTH_NAMES = /(\d{1,2})\s*월/;

/* ------------------------------------------------------------------ 기간 */

function monthRange(year: number, month1: number): { from: string; to: string } {
  const mm = String(month1).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDayOfMonth(year, month1)).padStart(2, '0')}` };
}

/**
 * 기간을 나타내는 말.
 *
 * 긴 말을 먼저 본다 — '지난달'을 '달'로 먼저 잡으면 '지난'이 남아 내용 검색어가 된다.
 */
function matchPeriod(text: string, today: string): Hit | null {
  const y = Number(today.slice(0, 4));

  const fixed: [RegExp, string, () => { from: string; to: string }][] = [
    [/오늘/, '오늘', () => ({ from: today, to: today })],
    [/어제/, '어제', () => ({ from: addDays(today, -1), to: addDays(today, -1) })],
    [/그저께|그제/, '그저께', () => ({ from: addDays(today, -2), to: addDays(today, -2) })],
    [/이번\s*주|금주/, '이번 주', () => ({ from: startOfWeek(today), to: endOfWeek(today) })],
    [/지난\s*주|저번\s*주/, '지난주', () => {
      const d = addDays(today, -7);
      return { from: startOfWeek(d), to: endOfWeek(d) };
    }],
    [/이번\s*달|이달|금월/, '이번 달', () => ({ from: startOfMonth(today), to: endOfMonth(today) })],
    [/지난\s*달|저번\s*달|전달/, '지난달', () => {
      const d = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    }],
    [/올해|금년/, '올해', () => ({ from: startOfYear(today), to: endOfYear(today) })],
    [/작년|지난\s*해/, '작년', () => ({ from: `${y - 1}-01-01`, to: `${y - 1}-12-31` })],
  ];

  for (const [re, label, range] of fixed) {
    const m = re.exec(text);
    if (m) {
      const { from, to } = range();
      return { term: { key: 'period', label }, consumed: m[0], apply: (q) => ((q.from = from), (q.to = to)) };
    }
  }

  // '최근 30일' · '최근 3개월'
  const recent = /최근\s*(\d{1,3})\s*(일|개월|달|주)/.exec(text);
  if (recent) {
    const n = Number(recent[1]);
    const days = recent[2] === '일' ? n : recent[2] === '주' ? n * 7 : n * 30;
    const from = addDays(today, -(days - 1));
    return {
      term: { key: 'period', label: `최근 ${n}${recent[2]}` },
      consumed: recent[0],
      apply: (q) => ((q.from = from), (q.to = today)),
    };
  }

  // '2025년 8월' · '8월' — 해가 없으면 올해다.
  const withYear = /(\d{4})\s*년\s*(\d{1,2})\s*월/.exec(text);
  if (withYear) {
    const { from, to } = monthRange(Number(withYear[1]), Number(withYear[2]));
    return {
      term: { key: 'period', label: `${withYear[1]}년 ${Number(withYear[2])}월` },
      consumed: withYear[0],
      apply: (q) => ((q.from = from), (q.to = to)),
    };
  }
  const onlyMonth = MONTH_NAMES.exec(text);
  if (onlyMonth) {
    const month = Number(onlyMonth[1]);
    if (month >= 1 && month <= 12) {
      const { from, to } = monthRange(y, month);
      return {
        term: { key: 'period', label: `${y}년 ${month}월` },
        consumed: onlyMonth[0],
        apply: (q) => ((q.from = from), (q.to = to)),
      };
    }
  }

  // '2025년' — 달 없이 해만
  const onlyYear = /(\d{4})\s*년/.exec(text);
  if (onlyYear) {
    const year = Number(onlyYear[1]);
    return {
      term: { key: 'period', label: `${year}년` },
      consumed: onlyYear[0],
      apply: (q) => ((q.from = `${year}-01-01`), (q.to = `${year}-12-31`)),
    };
  }
  return null;
}

/* ------------------------------------------------------------------ 방향 */

function matchDirection(text: string): Hit | null {
  const income = /수입|들어온|받은|벌었|입금|수령/.exec(text);
  if (income) {
    return { term: { key: 'direction', label: '수입만' }, consumed: income[0], apply: (q) => (q.direction = 'income') };
  }
  // '사용'·'소비'도 지출이다 — 이 말을 모르면 '사용'이 내용 검색어로 새어 0 건이 된다.
  const expense = /지출|사용|소비|나간|나감|쓴|썼|결제|출금|지불/.exec(text);
  if (expense) {
    return { term: { key: 'direction', label: '지출만' }, consumed: expense[0], apply: (q) => (q.direction = 'expense') };
  }
  return null;
}

/* ------------------------------------------------------------------ 금액 */

/**
 * '3만원 이상' · '5천원 미만'. **비교하는 말이 붙어 있을 때만** 금액으로 본다 —
 * 그냥 '8500원'은 금액 조건이 아니라 내용 검색어일 수 있기 때문이다
 * (기록의 내용에 금액을 적어 두는 사람이 있다).
 */
function matchAmounts(text: string): Hit[] {
  const out: Hit[] = [];
  const re = /([\d,]+(?:\.\d+)?\s*(?:억|만|천|백)?\s*원?)\s*(이상|넘는|넘게|초과|이하|미만|아래|밑)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseAmountToken(m[1].replace(/\s+/g, ''));
    if (value === null || value <= 0) continue;
    const isMin = /이상|넘는|넘게|초과/.test(m[2]);
    out.push({
      term: { key: 'amount', label: `${value.toLocaleString('ko-KR')}원 ${isMin ? '이상' : '이하'}` },
      consumed: m[0],
      apply: (q) => (isMin ? (q.amountMin = value) : (q.amountMax = value)),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ 분류 */

/** 태그 이름이 문장에 그대로 있으면 그 태그다. 긴 이름을 먼저 본다 — '식비'와 '외식비'. */
function matchCategory(text: string, categories: Category[]): Hit | null {
  const sorted = [...categories].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    if (c.name && text.includes(c.name)) {
      return { term: { key: 'category', label: `태그 ${c.name}` }, consumed: c.name, apply: (q) => (q.categoryId = c.id) };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ 전체 */

/** 조건을 알아들은 뒤 남은 말에서 걷어 낼, 뜻 없는 꼬리말. */
const FILLER =
  /찾아|보여|알려|검색|조회|주세요|해\s*줘|줘|내역|이용|목록|리스트|기록|거래|내용|얼마나|얼마|무엇|뭘|뭐|어디|따로|각각|나눠|나누어|구분|그리고|하고|랑|에서|에게|한테|으로|까지|부터|정도|쯤|것|거|들|중에|중|의|은|는|이|가|을|를|에|도|만|좀|다/g;

const INCOME_WORD = /수입|들어온|받은|벌었|입금|수령/;
const EXPENSE_WORD = /지출|사용|소비|나간|나감|쓴|썼|결제|출금|지불/;

/**
 * 조회를 **나눠서** 보여 달라는 말인가.
 *
 * 두 갈래다: ① '따로'·'각각'처럼 나누라고 말한 경우 ② 수입과 지출을 **둘 다**
 * 말한 경우. ②를 넣지 않으면 "지출과 수입 보여줘"에서 먼저 걸리는 한쪽만
 * 조건이 되어, 사용자가 말한 절반이 조용히 사라진다.
 */
function wantsSplit(text: string): boolean {
  if (/따로|각각|나눠|나누어|구분/.test(text)) return true;
  return INCOME_WORD.test(text) && EXPENSE_WORD.test(text);
}

/**
 * 낱말 끝에 붙는 **풀이말의 꼬리**. 조사와 달리 낱말의 일부처럼 붙어 있어
 * `FILLER` 로는 떨어지지 않는다 — '학식먹었어'가 통째로 남는 이유다.
 *
 * 이 목록이 한국어를 다 아는 것은 아니다. **알아듣는 일의 본체는 외부 수단**이고
 * 여기는 그것이 죽었을 때의 길이다(ADR-043). 다만 죽었을 때 **틀린 검색어를
 * 지어내는 것**보다는 모르는 채로 두는 편이 낫다.
 */
const VERB_TAIL =
  /(먹었었|먹었|먹은|먹|샀었|샀|산|썼었|썼|쓴|했었|했|한|갔었|갔|간|봤|본|였|이었|있었|있|없었|없)?(어요|어|다면|다|나요|나|니|냐|지|는지|까|면|음|임|인가|인지|요|\?)*$/;

/** 검색어로 쓸 만한 낱말인가. 꼬리를 떼고 남은 것이 두 글자 이상이어야 한다. */
function contentWord(token: string): string | null {
  const core = token.replace(VERB_TAIL, '');
  return core.length >= 2 ? core : null;
}

export interface ParsedQuery {
  parts: QueryPart[];
}

/**
 * 문장 하나를 조회 조건으로 바꾼다.
 *
 * 알아들은 조각을 문장에서 덜어 내고, 마지막에 남은 말을 내용 검색어로 삼는다.
 * 남은 말이 꼬리말뿐이면 내용 검색어를 두지 않는다 — '내역 보여줘'로 모든 기록의
 * 내용에서 '보여'를 찾는 일은 없어야 한다.
 */
export function parseQuery(text: string, today: string, categories: Category[]): ParsedQuery {
  const query: RecordQuery = {};
  const terms: QueryTerm[] = [];
  let rest = text;

  const take = (hit: Hit | null) => {
    if (!hit) return;
    hit.apply(query);
    terms.push(hit.term);
    rest = rest.replace(hit.consumed, ' ');
  };

  take(matchPeriod(rest, today));
  take(matchCategory(rest, categories));
  for (const hit of matchAmounts(rest)) take(hit);
  const split = wantsSplit(text);
  if (split) {
    /*
     * 나눠 볼 것이면 방향은 몫마다 정해지므로 조건으로 잡지 않는다. 다만
     * **문장에서는 덜어 낸다** — 덜어 내지 않으면 '지출과 수입'이 통째로 남아
     * 내용 검색어가 되고, 그 낱말이 적힌 기록은 없으니 두 몫이 다 0 건이 된다
     * (실제로 겪음).
     */
    rest = rest.replace(INCOME_WORD, ' ').replace(EXPENSE_WORD, ' ');
  } else {
    take(matchDirection(rest));
  }

  /*
   * 남은 말에서 **검색어 하나**를 고른다. 남은 것을 통째로 검색어로 삼던 때에는
   * "이번주에 학식먹었어? 먹었다면 얼마썼어?" 가 `내용 "학식먹었어 먹었면 어"` 가
   * 되어 **반드시 0 건**이었다(실제로 겪음). 있는 것을 못 찾는 것이 아니라
   * 찾을 수 없는 것을 만들어 낸 것이다.
   *
   * 그래서 낱말마다 풀이말의 꼬리를 떼고, **하나만 남을 때** 그것을 검색어로 쓴다.
   * 여럿이 남으면 무엇이 기록에 적혔을 말인지 규칙으로는 가릴 수 없으므로
   * **검색어를 두지 않는다** — 기간과 방향만으로 찾아 주는 편이 0 건보다 낫다.
   */
  const words = rest
    .replace(FILLER, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(contentWord)
    .filter((w): w is string => w !== null);

  if (words.length === 1) {
    query.text = words[0];
    terms.push({ key: 'text', label: `내용 "${words[0]}"` });
  }

  if (split) {
    /*
     * 나눈 몫에는 **방향만 다르게** 준다. 나머지 조건(기간·태그·금액·내용)은
     * 두 몫이 함께 쓴다 — 사용자가 나누라고 한 것은 방향이지 기간이 아니다.
     */
    const base = { ...query };
    delete base.direction;
    return {
      parts: [
        { label: '지출', query: { ...base, direction: 'expense' }, terms },
        { label: '수입', query: { ...base, direction: 'income' }, terms },
      ],
    };
  }

  return terms.length === 0 ? { parts: [] } : { parts: [{ label: '', query, terms }] };
}
