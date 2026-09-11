/**
 * 날짜 다루기 — 모든 날짜는 기기 지역시 기준의 'YYYY-MM-DD' 문자열이다.
 * SRS §9 가정: 입력 제출 시점의 기기 날짜가 정확하다.
 */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 해당 달의 마지막 날(1~31). */
export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** 'YYYY-MM' */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function yearKey(iso: string): string {
  return iso.slice(0, 4);
}

/**
 * 주의 시작을 월요일로 본다. 달력 표시는 일요일 시작이지만(HeroUI 기본),
 * 기간 집계의 '이번 주'는 월~일로 잡는다 — 가계 감각에 더 맞고 요약이 흔들리지 않는다.
 */
export function startOfWeek(iso: string): string {
  const d = parseISODate(iso);
  const dow = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 7)}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`;
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function endOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-12-31`;
}

export type PeriodType = 'week' | 'month' | 'year';

/** 기간 범위(FR-VIEW-03) — 주·월·연 단위. */
export function periodRange(type: PeriodType, anchor: string): { from: string; to: string } {
  switch (type) {
    case 'week':
      return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
    case 'month':
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case 'year':
      return { from: startOfYear(anchor), to: endOfYear(anchor) };
  }
}

/** 앞으로 n 개 기간을 시간 순서로(FR-VIEW-05). 마지막이 anchor 가 속한 기간이다. */
export function previousPeriods(type: PeriodType, anchor: string, count: number): { from: string; to: string; label: string }[] {
  const out: { from: string; to: string; label: string }[] = [];
  let cursor = anchor;
  for (let i = 0; i < count; i++) {
    const r = periodRange(type, cursor);
    out.unshift({ ...r, label: periodLabel(type, r.from) });
    cursor = shiftBack(type, r.from);
  }
  return out;
}

function shiftBack(type: PeriodType, from: string): string {
  if (type === 'week') return addDays(from, -1);
  if (type === 'month') return addDays(from, -1);
  return `${Number(from.slice(0, 4)) - 1}-12-31`;
}

/**
 * 기간을 앞뒤로 옮긴다 — 통계 화면의 ‹ › 가 쓴다.
 *
 * 옮긴 결과는 **그 기간의 첫날**로 돌려준다. 앵커가 기간 안 아무 날이나여도
 * 되지만, 첫날로 고정해야 31일에서 2월로 옮길 때 날짜가 흘러넘치지 않는다.
 */
export function shiftPeriod(type: PeriodType, anchor: string, delta: number): string {
  if (type === 'week') return addDays(startOfWeek(anchor), delta * 7);
  if (type === 'month') {
    const d = new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + delta, 1);
    return toISODate(d);
  }
  return `${Number(anchor.slice(0, 4)) + delta}-01-01`;
}

/**
 * 그 날이 속한 주가 **몇 월 몇 주차**인가.
 *
 * 규칙은 하나다 — **그 달의 1일이 들어 있는 주가 그 달의 1주차**다.
 * 그래서 2026-08-31(월)~09-06(일)은 9월 1일을 품고 있으므로 '9월 1주차'이고,
 * 8월의 마지막 주가 아니다. 주는 월요일에 시작한다(`startOfWeek`).
 *
 * 1일을 품지 않은 주는 이레가 모두 한 달 안에 있으므로 그 달의 것이다.
 * 이렇게 하면 어느 주도 두 번 세거나 빠지지 않는다.
 */
export function weekOfMonth(iso: string): { year: number; month: number; week: number } {
  const mon = startOfWeek(iso);

  let owner = mon.slice(0, 7);
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    if (d.slice(8, 10) === '01') {
      owner = d.slice(0, 7);
      break;
    }
  }

  const firstMon = startOfWeek(`${owner}-01`);
  // 날수를 세지 않고 반올림한다 — 시간대에 따라 하루가 23·25시간일 수 있다.
  const weeks = Math.round(
    (parseISODate(mon).getTime() - parseISODate(firstMon).getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  return { year: Number(owner.slice(0, 4)), month: Number(owner.slice(5, 7)), week: weeks + 1 };
}

export function periodLabel(type: PeriodType, from: string): string {
  const y = from.slice(0, 4);
  const m = Number(from.slice(5, 7));
  const d = Number(from.slice(8, 10));
  if (type === 'week') return `${m}/${d}`;
  if (type === 'month') return `${m}월`;
  return `${y}년`;
}

/** 사람이 읽는 표기. 예: 2026년 9월 8일 (화) */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function humanDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

export function todayISO(): string {
  return toISODate(new Date());
}
