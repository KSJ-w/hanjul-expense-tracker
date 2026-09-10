/**
 * VIEW — 쉬는 날. 달력이 어느 날짜를 붉게 적는가(FR-VIEW-12).
 *
 * 이 표는 밖으로 나가서 확인할 수 없다(SDD §2 불변조건 1). 그러므로 표가 맞는지는
 * **여기서만** 지켜진다. 해마다의 값 몇 개를 못 박아 두고, 대체공휴일 규칙은
 * 규칙대로 판정되는지를 따로 본다.
 */
import { describe, it, expect } from 'vitest';
import { hasLunarTable, holidayName, holidaysOfYear, isRedDay } from '@/lib/domain/holiday';

describe('VIEW 쉬는 날', () => {
  it('[TC-VIEW-33] FR-VIEW-12: 양력 고정 공휴일이 모두 나온다', () => {
    const y = 2026;
    const fixed: [string, string][] = [
      [`${y}-01-01`, '신정'],
      [`${y}-03-01`, '삼일절'],
      [`${y}-05-05`, '어린이날'],
      [`${y}-06-06`, '현충일'],
      [`${y}-08-15`, '광복절'],
      [`${y}-10-03`, '개천절'],
      [`${y}-10-09`, '한글날'],
      [`${y}-12-25`, '성탄절'],
    ];
    for (const [date, name] of fixed) expect(holidayName(date)).toBe(name);
  });

  it('[TC-VIEW-34] FR-VIEW-12: 음력에서 오는 공휴일이 연휴까지 나온다', () => {
    // 2026: 설날 2/17(화) · 추석 9/25(금) · 부처님오신날 5/24(일)
    expect(holidayName('2026-02-16')).toBe('설 연휴');
    expect(holidayName('2026-02-17')).toBe('설날');
    expect(holidayName('2026-02-18')).toBe('설 연휴');
    expect(holidayName('2026-09-24')).toBe('추석 연휴');
    expect(holidayName('2026-09-25')).toBe('추석');
    expect(holidayName('2026-09-26')).toBe('추석 연휴');
    expect(holidayName('2026-05-24')).toBe('부처님오신날');
  });

  it('[TC-VIEW-35] FR-VIEW-12: 토·일과 겹친 공휴일 다음의 첫 비공휴일이 대체공휴일이 된다', () => {
    // 2026-03-01 은 일요일 → 3/2(월)
    expect(holidayName('2026-03-02')).toBe('대체공휴일');
    // 2026-08-15 는 토요일 → 8/16 은 일요일이므로 건너뛰고 8/17(월)
    expect(holidayName('2026-08-16')).toBeNull();
    expect(holidayName('2026-08-17')).toBe('대체공휴일');
    // 2026-10-03 은 토요일 → 10/5(월)
    expect(holidayName('2026-10-05')).toBe('대체공휴일');
  });

  it('[TC-VIEW-36] FR-VIEW-12: 한 날에 공휴일이 겹쳐도 대체공휴일은 하루만 생긴다', () => {
    // 2025-05-05 는 어린이날이자 부처님오신날이었고, 대체공휴일은 5/6 하루였다.
    expect(holidayName('2025-05-05')).toBe('어린이날·부처님오신날');
    expect(holidayName('2025-05-06')).toBe('대체공휴일');
    expect(holidayName('2025-05-07')).toBeNull();
  });

  it('[TC-VIEW-37] FR-VIEW-12: 설·추석 연휴는 토요일과 겹쳐도 대체공휴일이 생기지 않는다', () => {
    // 2026 추석 연휴는 9/24(목)·9/25(금)·9/26(토). 규정상 토요일 겹침은 대체 대상이 아니다.
    expect(holidayName('2026-09-28')).toBeNull();
    // 반면 일요일과 겹치면 생긴다 — 2025 추석 연휴는 10/5(일)부터였다.
    expect(holidayName('2025-10-05')).toBe('추석 연휴');
    expect(holidayName('2025-10-08')).toBe('대체공휴일');
    // 신정과 현충일은 어느 요일에 오든 대체가 없다 — 2028-01-01 은 토요일이다.
    expect(holidayName('2028-01-01')).toBe('신정');
    expect(holidayName('2028-01-03')).toBeNull();
  });

  it('[TC-VIEW-38] FR-VIEW-12: 붉게 적을 날은 일요일이거나 공휴일이다', () => {
    expect(isRedDay('2026-09-06')).toBe(true); // 일요일
    expect(isRedDay('2026-09-25')).toBe(true); // 추석(금요일)
    expect(isRedDay('2026-09-05')).toBe(false); // 토요일이지만 공휴일이 아니다
    expect(isRedDay('2026-09-07')).toBe(false); // 평일
  });

  it('[TC-VIEW-39] FR-VIEW-12: 표에 없는 해는 양력 공휴일만 안다고 말한다', () => {
    expect(hasLunarTable(2026)).toBe(true);
    expect(hasLunarTable(2099)).toBe(false);
    // 표 밖의 해에도 양력 공휴일은 계산된다 — 화면이 빈 달력이 되지 않는다.
    expect(holidayName('2099-01-01')).toBe('신정');
    // 음력에서 오는 것은 모른다. 모르는 것을 아는 척하지 않는다.
    expect([...holidaysOfYear(2099).values()]).not.toContain('설날');
  });
});
