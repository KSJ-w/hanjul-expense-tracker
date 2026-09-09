/**
 * VIEW — 금액 표시 계약. 부호는 **방향이 먼저**다.
 *
 * 같은 지출이 달력에서는 −8,500, 내역에서는 +8,500 으로 보인 적이 있다.
 * 이 제품의 금액은 늘 양수 크기이고 방향을 따로 들고 있는데,
 * 숫자의 양수 여부를 방향보다 먼저 봤기 때문이다. 그 계약을 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest';
import type { Direction } from '@/lib/domain/types';

/** atoms.tsx 의 Money 가 쓰는 규칙과 같은 식. 화면 없이 계약만 시험한다. */
function signOf(amount: number, direction: Direction | undefined, signed = true): string {
  if (!signed || amount === 0) return '';
  if (direction === 'expense') return '−';
  if (direction === 'income') return '+';
  return amount < 0 ? '−' : '+';
}
function render(amount: number, direction?: Direction, signed = true): string {
  return `${signOf(amount, direction, signed)}${Math.abs(amount).toLocaleString('ko-KR')}원`;
}

describe('VIEW 금액 표시', () => {
  it('[TC-VIEW-32] FR-VIEW-02: 부호는 방향을 먼저 따르고 0 에는 붙지 않는다', () => {
    // 지출은 금액이 양수여도 −
    expect(render(8500, 'expense')).toBe('−8,500원');
    expect(render(8500, 'income')).toBe('+8,500원');

    // 라벨이 이미 방향을 말하는 자리는 부호를 뺀다
    expect(render(8500, 'expense', false)).toBe('8,500원');

    // 0 에는 뜻 없는 기호를 붙이지 않는다
    expect(render(0, 'expense')).toBe('0원');

    // 방향이 없을 때만 숫자의 부호로 판단한다(기간 차액)
    expect(render(-8500, undefined)).toBe('−8,500원');
    expect(render(8500, undefined)).toBe('+8,500원');
  });
});
