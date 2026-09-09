/**
 * 한국어 입력에서 날짜·방향·거래 대상을 뽑는 규칙.
 * 기기 안에서만 동작하며 밖으로 아무것도 내보내지 않는다.
 */
import { addDays, isISODate, parseISODate, toISODate } from '../domain/date';
import { findAmounts, type AmountMatch } from '../domain/money';

/* ------------------------------------------------------------------ 방향 */

const INCOME_WORDS = [
  '월급', '급여', '봉급', '상여', '보너스', '입금', '들어옴', '들어왔', '들어온',
  '받았', '받은', '받음', '수입', '환급', '캐시백', '이자', '배당', '용돈', '정산',
  '판매', '팔았', '벌었', '수령',
];

const EXPENSE_HINTS = ['결제', '지출', '샀', '삼', '썼', '씀', '사용', '냈', '냄', '구매', '계산'];

export function detectDirection(text: string): 'income' | 'expense' {
  const t = text.replace(/\s/g, '');
  const income = INCOME_WORDS.some((w) => t.includes(w));
  const expense = EXPENSE_HINTS.some((w) => t.includes(w));
  if (income && !expense) return 'income';
  if (income && expense) return 'income'; // "월급 입금" 처럼 수입 표현이 더 특정적이다
  // 지출 힌트가 없어도 가계부 입력의 기본은 지출이다. 다만 근거가 약하므로
  // 호출부가 이 값을 '추정'으로 다룰 수 있게 그대로 돌려준다.
  return 'expense';
}

/** 방향을 문장에서 확실히 읽어냈는가. 확신이 없으면 미확정으로 둘 수 있다. */
export function directionIsExplicit(text: string): boolean {
  const t = text.replace(/\s/g, '');
  return INCOME_WORDS.some((w) => t.includes(w)) || EXPENSE_HINTS.some((w) => t.includes(w));
}

/* -------------------------------------------------------------------- 날짜 */

const DOW_NAMES: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

const RELATIVE: Record<string, number> = {
  그끄저께: -3, 그끄제: -3,
  그저께: -2, 그제: -2,
  어제: -1, 어저께: -1,
  오늘: 0, 금일: 0,
  내일: 1, 명일: 1,
  모레: 2, 내일모레: 2,
  글피: 3,
};

export interface DateMatch {
  date: string;
  start: number;
  end: number;
  raw: string;
}

/**
 * 문장에서 날짜 표현을 찾아 확정 날짜로 바꾼다(FR-ENTRY-02).
 * 기준은 today 다. 찾지 못하면 null.
 */
export function detectDate(text: string, today: string): DateMatch | null {
  // 1) 절대 표기 YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  let m = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(text);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if (isISODate(iso)) return { date: iso, start: m.index, end: m.index + m[0].length, raw: m[0] };
  }

  // 2) M월 D일
  m = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text);
  if (m) {
    const iso = resolveMonthDay(Number(m[1]), Number(m[2]), today);
    if (iso) return { date: iso, start: m.index, end: m.index + m[0].length, raw: m[0] };
  }

  // 3) M/D  (금액과 헷갈리지 않게 앞뒤가 숫자가 아닐 때만)
  m = /(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(text);
  if (m) {
    const iso = resolveMonthDay(Number(m[1]), Number(m[2]), today);
    if (iso) {
      const start = m.index + m[0].indexOf(m[1]);
      return { date: iso, start, end: start + m[1].length + 1 + m[2].length, raw: `${m[1]}/${m[2]}` };
    }
  }

  // 4) N일 전 / N일 뒤
  m = /(\d{1,3})\s*일\s*(전|뒤|후)/.exec(text);
  if (m) {
    const n = Number(m[1]) * (m[2] === '전' ? -1 : 1);
    return { date: addDays(today, n), start: m.index, end: m.index + m[0].length, raw: m[0] };
  }

  // 5) 지난주/저번주/이번주 + 요일
  m = /(지난주|저번주|지난 주|저번 주|이번주|이번 주|금주)\s*([일월화수목금토])\s*요일?/.exec(text);
  if (m) {
    const target = DOW_NAMES[m[2]];
    const isLast = !/이번|금주/.test(m[1]);
    const iso = weekdayInWeek(today, target, isLast ? -1 : 0);
    return { date: iso, start: m.index, end: m.index + m[0].length, raw: m[0] };
  }

  // 6) 지난/저번 + 요일  → 가장 가까운 지난 그 요일
  m = /(지난|저번)\s*([일월화수목금토])\s*요일?/.exec(text);
  if (m) {
    const iso = lastWeekday(today, DOW_NAMES[m[2]], true);
    return { date: iso, start: m.index, end: m.index + m[0].length, raw: m[0] };
  }

  // 7) 상대 표현
  for (const [word, delta] of Object.entries(RELATIVE)) {
    const idx = text.indexOf(word);
    if (idx !== -1) {
      return { date: addDays(today, delta), start: idx, end: idx + word.length, raw: word };
    }
  }

  // 8) 요일 단독 → 오늘 포함 가장 가까운 지난 그 요일
  m = /([일월화수목금토])\s*요일/.exec(text);
  if (m) {
    const iso = lastWeekday(today, DOW_NAMES[m[1]], false);
    return { date: iso, start: m.index, end: m.index + m[0].length, raw: m[0] };
  }

  // 9) D일 (단독) — 이번 달의 그 날. 미래면 지난달로 본다.
  m = /(?:^|[^\d])(\d{1,2})\s*일(?![\s]*(?:전|뒤|후))/.exec(text);
  if (m) {
    const day = Number(m[1]);
    const iso = resolveDayOnly(day, today);
    if (iso) {
      const start = m.index + m[0].indexOf(m[1]);
      return { date: iso, start, end: start + m[0].length - m[0].indexOf(m[1]), raw: m[0].trim() };
    }
  }

  return null;
}

/** 월/일만 주어졌을 때 연도를 정한다. 미래로 6개월 넘게 벌어지면 작년으로 본다. */
function resolveMonthDay(month: number, day: number, today: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const y = Number(today.slice(0, 4));
  for (const year of [y, y - 1]) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isISODate(iso)) continue;
    if (year === y && diffDays(iso, today) > 180) continue; // 너무 먼 미래 → 작년으로
    return iso;
  }
  return null;
}

function resolveDayOnly(day: number, today: string): string | null {
  if (day < 1 || day > 31) return null;
  const mk = today.slice(0, 7);
  let iso = `${mk}-${String(day).padStart(2, '0')}`;
  if (!isISODate(iso)) return null;
  if (iso > today) {
    // 아직 오지 않은 날이면 지난달의 그 날로 본다
    const d = parseISODate(`${mk}-01`);
    d.setMonth(d.getMonth() - 1);
    const prev = toISODate(d).slice(0, 7);
    iso = `${prev}-${String(day).padStart(2, '0')}`;
    if (!isISODate(iso)) return null;
  }
  return iso;
}

function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

/** weekOffset: 0=이번 주, -1=지난주. 주는 월요일 시작으로 본다. */
function weekdayInWeek(today: string, targetDow: number, weekOffset: number): string {
  const d = parseISODate(today);
  const mondayDelta = -((d.getDay() + 6) % 7);
  d.setDate(d.getDate() + mondayDelta + weekOffset * 7);
  // 월요일 기준으로 target 까지의 거리(월=0 … 일=6)
  const targetIdx = (targetDow + 6) % 7;
  d.setDate(d.getDate() + targetIdx);
  return toISODate(d);
}

/** 가장 가까운 지난 그 요일. strictlyBefore 면 오늘은 제외한다. */
function lastWeekday(today: string, targetDow: number, strictlyBefore: boolean): string {
  const d = parseISODate(today);
  let delta = (d.getDay() - targetDow + 7) % 7;
  if (delta === 0 && strictlyBefore) delta = 7;
  return addDays(today, -delta);
}

/* --------------------------------------------------------------- 거래 대상 */

const DROP_TOKENS = new Set([
  '에서', '에게', '에', '으로', '로', '을', '를', '이', '가', '은', '는', '와', '과', '및',
  '결제', '지출', '사용', '구매', '계산', '냈다', '냄', '썼다', '씀', '샀다', '삼', '함',
  '오늘', '어제', '그제', '그저께', '내일', '모레', '아침', '점심', '저녁', '밤', '새벽',
  '오전', '오후', '원', '정도', '쯤', 'about',
]);

const PARTICLE_RE = /(에서|에게|으로|에|을|를|이|가|은|는|와|과|랑|이랑|도)$/;

/**
 * 금액 앞쪽에서 거래 대상을 고른다.
 * "어제 점심 김밥천국 8000원" → 김밥천국
 * 확신이 낮으면 null 을 돌려준다 — 틀린 거래 대상으로 분류를 학습하면 오배정이 퍼진다.
 */
export function detectMerchant(segment: string, amount: AmountMatch | null, dateSpan: DateMatch | null): string | null {
  let head = amount ? segment.slice(0, amount.start) : segment;
  if (dateSpan && dateSpan.start < head.length) {
    head = head.slice(0, dateSpan.start) + ' ' + head.slice(Math.min(head.length, dateSpan.end));
  }
  const tokens = head
    .replace(/[.,·/]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(PARTICLE_RE, ''))
    .filter((t) => t.length > 0 && !DROP_TOKENS.has(t) && !/^\d+$/.test(t));

  if (tokens.length === 0) return null;
  // 금액에 가장 가까운 토큰이 대개 상호다.
  const last = tokens[tokens.length - 1];
  if (last.length < 2) return null;
  return last;
}

/* ------------------------------------------------------------------ 분할 */

/**
 * 한 입력에 여러 거래가 담겼는지 나눈다(FR-ENTRY-03).
 * 금액이 둘 이상일 때만 나눈다 — 금액이 하나면 아무리 길어도 한 건이다.
 */
export function splitSegments(text: string): string[] {
  const amounts = findAmounts(text);
  if (amounts.length < 2) return [text.trim()].filter(Boolean);

  const parts = text
    .split(/\n|,|、|;|\s+그리고\s+|\s+및\s+|\s\/\s/)
    .map((s) => s.trim())
    .filter(Boolean);

  const withAmount = parts.filter((p) => findAmounts(p).length > 0);
  if (withAmount.length >= 2) return withAmount;

  // 구분자가 없었다면 금액 위치를 경계로 자른다.
  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < amounts.length; i++) {
    const end = i === amounts.length - 1 ? text.length : amounts[i + 1].start;
    const chunk = text.slice(cursor, end).trim();
    if (chunk) out.push(chunk);
    cursor = end;
  }
  return out.length >= 2 ? out : [text.trim()];
}
