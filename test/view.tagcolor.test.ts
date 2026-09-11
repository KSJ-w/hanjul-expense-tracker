/**
 * VIEW — 태그의 색(ADR-032).
 *
 * 색은 화면에서 눈으로 보지만, **지켜야 하는 것은 값**이다:
 * 한 태그는 늘 같은 색이어야 하고, 흰 바탕에서 도형으로 보여야 한다.
 */
import { describe, it, expect } from 'vitest';
import { contrastOnWhite, NO_TAG_PAINT, paletteColor, tagColor, _slots } from '@/app/ui/tagColor';

const rgbOf = (css: string): [number, number, number] => {
  const m = css.match(/rgb\((\d+) (\d+) (\d+)\)/);
  if (!m) throw new Error(`색 형식이 아니다: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

describe('VIEW 태그 색', () => {
  it('[TC-VIEW-43] FR-VIEW-04: 자리가 같으면 늘 같은 색이고, 열둘까지는 서로 다르다', () => {
    const first = tagColor('cat_seed_e0', 3).fill;
    for (let i = 0; i < 20; i++) expect(tagColor('cat_seed_e0', 3).fill).toBe(first);

    /*
     * 여기가 이 시험의 요점이다. 서로 독립인 해시로 색을 고르던 때에는 태그
     * 다섯 중 셋이 초록으로 몰렸다 — '다르다'가 보장되지 않았다.
     * 자리로 고르면 칸 수만큼은 반드시 모두 다르다.
     */
    const slots = Array.from({ length: _slots.HUE_SLOTS }, (_, i) => paletteColor(i).fill);
    expect(new Set(slots).size).toBe(_slots.HUE_SLOTS);

    // 이웃한 자리끼리 비슷한 색이 되지 않게 한 칸씩 건너뛴다.
    expect(paletteColor(0).fill).not.toBe(paletteColor(1).fill);
    // 칸을 넘어서면 처음으로 돌아온다 — 겹치되 '거의 같은' 색은 만들지 않는다.
    expect(paletteColor(_slots.HUE_SLOTS).fill).toBe(paletteColor(0).fill)
  });

  it('[TC-VIEW-44] FR-VIEW-04: 면은 파스텔이고, 3:1 은 같은 색상의 테두리가 맡는다', () => {
    /*
     * 파스텔은 흰 바탕에서 2:1 을 넘지 못한다 — 그것이 파스텔이다(ADR-036).
     * 그래서 '도형이 도형으로 보이는' 몫을 **테두리**에 옮겼다. 면만 보고
     * 3:1 을 재던 옛 시험을 그대로 두면 파스텔로는 영영 통과할 수 없다.
     */
    for (let i = 0; i < _slots.HUE_SLOTS; i++) {
      const hue = i * (360 / _slots.HUE_SLOTS);
      // 테두리는 색상마다 실제 대비를 재서 만든다. 어림값으로는 노랑·초록이 늘 모자랐다.
      const edge = _slots.darkenUntilVisible(hue, _slots.EDGE_SATURATION);
      expect(contrastOnWhite(edge)).toBeGreaterThanOrEqual(_slots.MIN_CONTRAST);
      // 같은 색상의 면은 테두리보다 반드시 밝다 — 뒤집히면 테두리가 면에 묻힌다.
      const fill = _slots.hslToRgb(hue, _slots.FILL.saturation, _slots.FILL.lightness);
      expect(contrastOnWhite(fill)).toBeLessThan(contrastOnWhite(edge));
    }

    // 실제로 태그가 받는 두 색도 마찬가지여야 한다.
    for (let slot = 0; slot < _slots.HUE_SLOTS; slot++) {
      const paint = paletteColor(slot);
      expect(contrastOnWhite(rgbOf(paint.edge))).toBeGreaterThanOrEqual(_slots.MIN_CONTRAST);
      expect(contrastOnWhite(rgbOf(paint.fill))).toBeLessThan(contrastOnWhite(rgbOf(paint.edge)));
    }
    // 목록에 없는 태그(보관된 것)도 같은 칸들 중 하나를 받으므로 마찬가지다.
    for (const id of ['cat_seed_e0', 'zzz']) {
      expect(contrastOnWhite(rgbOf(tagColor(id).edge))).toBeGreaterThanOrEqual(_slots.MIN_CONTRAST);
    }
    expect(contrastOnWhite(rgbOf(NO_TAG_PAINT.edge))).toBeGreaterThanOrEqual(_slots.MIN_CONTRAST);
  });

  it("[TC-VIEW-45] FR-VIEW-04: 태그가 없는 몫은 색을 가지지 않는다", () => {
    expect(tagColor('none', 0)).toBe(NO_TAG_PAINT);
    expect(tagColor('')).toBe(NO_TAG_PAINT);
    // 중립이라는 것은 채도가 거의 없다는 뜻이다 — R·G·B 가 서로 가깝다.
    for (const c of [NO_TAG_PAINT.fill, NO_TAG_PAINT.edge]) {
      const [r, g, b] = rgbOf(c);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(40);
    }
  });
});
