/**
 * 대한민국 관공서 공휴일 — FR-VIEW-12.
 *
 * 달력에서 붉게 읽히는 날이 무엇인지는 **기기 안에서** 정해야 한다.
 * 밖으로 나가는 호출은 `interpret/gemini.ts` 하나뿐이라는 불변조건(SDD §2-1)이
 * 여기에도 걸린다. 그래서 공휴일 API 를 부르지 않고 표를 들고 있는다.
 *
 * 양력 공휴일은 규칙으로 계산하고, 음력에서 오는 셋(설날·추석·부처님오신날)만
 * 해마다의 양력 날짜를 표로 둔다. 음력 변환기를 넣지 않는 이유는 그것이
 * 이 제품이 감당할 크기가 아니기 때문이다 — 표는 틀리면 한 줄로 고칠 수 있다.
 *
 * 대체공휴일은 「관공서의 공휴일에 관한 규정」 제3조를 따른다.
 *   · 설날·추석 연휴 — **일요일**과 겹치거나 다른 공휴일과 겹칠 때
 *   · 어린이날 — 토요일·일요일·다른 공휴일과 겹칠 때
 *   · 삼일절·광복절·개천절·한글날·부처님오신날·성탄절 — 토요일·일요일과 겹칠 때
 *   · 신정·현충일 — 대체 없음
 * 대체일은 그 날 **다음의 첫 비공휴일 평일**이며, 한 날짜가 여러 공휴일을
 * 겸해도 대체는 하루만 생긴다(2025-05-05 어린이날·부처님오신날이 그랬다).
 *
 * 임시공휴일과 선거일은 담지 않는다. 예측할 수 없는 것을 예측한 척하면
 * 표가 조용히 틀린다.
 */

import { addDays, parseISODate } from './date';

/** 음력에서 오는 공휴일의 양력 날짜. 표에 없는 해는 양력 공휴일만 안다. */
const LUNAR: Record<number, { seollal: string; chuseok: string; buddha: string }> = {
  2024: { seollal: '2024-02-10', chuseok: '2024-09-17', buddha: '2024-05-15' },
  2025: { seollal: '2025-01-29', chuseok: '2025-10-06', buddha: '2025-05-05' },
  2026: { seollal: '2026-02-17', chuseok: '2026-09-25', buddha: '2026-05-24' },
  2027: { seollal: '2027-02-06', chuseok: '2027-09-15', buddha: '2027-05-13' },
  2028: { seollal: '2028-01-26', chuseok: '2028-10-03', buddha: '2028-05-02' },
  2029: { seollal: '2029-02-13', chuseok: '2029-09-22', buddha: '2029-05-20' },
  2030: { seollal: '2030-02-03', chuseok: '2030-09-12', buddha: '2030-05-09' },
  2031: { seollal: '2031-01-23', chuseok: '2031-10-01', buddha: '2031-05-28' },
  2032: { seollal: '2032-02-11', chuseok: '2032-09-19', buddha: '2032-05-16' },
};

/** 표가 음력 공휴일까지 아는 해인지. 화면이 "모른다"를 말해야 할 때 쓴다. */
export function hasLunarTable(year: number): boolean {
  return year in LUNAR;
}

/** 토·일과 겹치면 대체공휴일이 생기는 공휴일. */
const SUB_ON_WEEKEND = new Set(['삼일절', '어린이날', '부처님오신날', '광복절', '개천절', '한글날', '성탄절']);
/** 일요일과 겹칠 때만 대체공휴일이 생기는 공휴일 — 설·추석 연휴. */
const SUB_ON_SUNDAY = new Set(['설날', '설 연휴', '추석', '추석 연휴']);
/** 다른 공휴일과 겹치면 대체공휴일이 생기는 공휴일. */
const SUB_ON_OVERLAP = new Set([...SUB_ON_SUNDAY, '어린이날', '부처님오신날', '성탄절']);

function isWeekend(iso: string): boolean {
  const dow = parseISODate(iso).getDay();
  return dow === 0 || dow === 6;
}

function push(map: Map<string, string[]>, iso: string, name: string): void {
  const list = map.get(iso);
  if (list) list.push(name);
  else map.set(iso, [name]);
}

/**
 * 그 해의 공휴일 — 'YYYY-MM-DD' → 이름.
 * 같은 날에 둘이 겹치면 이름을 '·' 로 잇는다(어린이날·부처님오신날).
 */
function computeYear(year: number): Map<string, string> {
  const base = new Map<string, string[]>();

  push(base, `${year}-01-01`, '신정');
  push(base, `${year}-03-01`, '삼일절');
  push(base, `${year}-05-05`, '어린이날');
  push(base, `${year}-06-06`, '현충일');
  push(base, `${year}-08-15`, '광복절');
  push(base, `${year}-10-03`, '개천절');
  push(base, `${year}-10-09`, '한글날');
  push(base, `${year}-12-25`, '성탄절');

  const lunar = LUNAR[year];
  if (lunar) {
    push(base, addDays(lunar.seollal, -1), '설 연휴');
    push(base, lunar.seollal, '설날');
    push(base, addDays(lunar.seollal, 1), '설 연휴');
    push(base, addDays(lunar.chuseok, -1), '추석 연휴');
    push(base, lunar.chuseok, '추석');
    push(base, addDays(lunar.chuseok, 1), '추석 연휴');
    push(base, lunar.buddha, '부처님오신날');
  }

  /*
   * 대체공휴일은 **날짜 단위**로 판정한다. 공휴일 이름마다 판정하면 한 날에
   * 둘이 겹칠 때 대체가 이틀 생긴다 — 2025-05-05 는 어린이날이자
   * 부처님오신날이었지만 대체공휴일은 5월 6일 하루였다.
   */
  const taken = new Set(base.keys());
  const substitutes: [string, string][] = [];
  for (const iso of [...base.keys()].sort()) {
    const names = base.get(iso)!;
    const dow = parseISODate(iso).getDay();
    const overlapped = names.length > 1;
    const trigger =
      (dow === 0 && names.some((n) => SUB_ON_WEEKEND.has(n) || SUB_ON_SUNDAY.has(n))) ||
      (dow === 6 && names.some((n) => SUB_ON_WEEKEND.has(n))) ||
      (overlapped && names.some((n) => SUB_ON_OVERLAP.has(n)));
    if (!trigger) continue;

    // 대체일은 '다음 첫 비공휴일' 이다 — 주말도 이미 쉬는 날이므로 건너뛴다.
    let cursor = addDays(iso, 1);
    while (taken.has(cursor) || isWeekend(cursor)) cursor = addDays(cursor, 1);
    taken.add(cursor);
    substitutes.push([cursor, '대체공휴일']);
  }

  const out = new Map<string, string>();
  for (const [iso, names] of base) out.set(iso, names.join('·'));
  for (const [iso, name] of substitutes) out.set(iso, name);
  return out;
}

const cache = new Map<number, Map<string, string>>();

export function holidaysOfYear(year: number): Map<string, string> {
  let y = cache.get(year);
  if (!y) {
    y = computeYear(year);
    cache.set(year, y);
  }
  return y;
}

/** 그 날이 공휴일이면 이름, 아니면 null. 대체공휴일은 '대체공휴일'로 온다. */
export function holidayName(iso: string): string | null {
  return holidaysOfYear(Number(iso.slice(0, 4))).get(iso) ?? null;
}

/**
 * 달력에서 붉게 적는 날인가 — 일요일이거나 공휴일이다.
 * 색만으로 뜻을 지지 않는다(ADR-020). 공휴일은 이름을 함께 적고,
 * 일요일은 격자의 첫 칸이라는 자리가 같은 뜻을 말한다.
 */
export function isRedDay(iso: string): boolean {
  return parseISODate(iso).getDay() === 0 || holidayName(iso) !== null;
}

/** 시험과 화면이 같은 표를 보는지 확인할 때 쓴다. */
export function holidaysInRange(from: string, to: string): { date: string; name: string }[] {
  const out: { date: string; name: string }[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const [date, name] of holidaysOfYear(y)) {
      if (date >= from && date <= to) out.push({ date, name });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
