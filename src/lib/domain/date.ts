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
