/**
 * VIEW — 3D 파이의 기하와 명암(ADR-035 · ADR-032).
 *
 * 기울여 본 원은 **안 보이는 면을 그리면 도형이 깨진다.** 뒤쪽 조각의 둘레벽이
 * 앞 조각 위로 삐져나오거나, 잘린 면이 조각 안쪽에 유령처럼 남는다. 그런데 그
 * 잘못은 화면에서 "왜인지 이상하다" 정도로만 보여서 눈으로 잡히지 않는다.
 * 보이는 면을 고르는 규칙과 투영의 부호를 값으로 못 박는 이유다.
 */
import { describe, it, expect } from 'vitest';
import {
  backToFront,
  EDGE_DARKEN,
  edgePath,
  layoutWedges,
  project,
  showsEndEdge,
  showsStartEdge,
  splitOffset,
  TILT,
  topPath,
  VIEW,
  visibleArc,
  WALL_DARKEN,
  wallPath,
  type Wedge,
} from '@/app/ui/pieDepth';
import { contrastOnWhite, darkenColor, paletteColor, _slots } from '@/app/ui/tagColor';

const rgbOf = (css: string): [number, number, number] => {
  const m = css.match(/rgb\((\d+) (\d+) (\d+)\)/);
  if (!m) throw new Error(`색 형식이 아니다: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const wedge = (start: number, end: number): Wedge => ({
  id: 'w',
  start,
  end,
  mid: (start + end) / 2,
});

describe('VIEW 3D 파이의 기하', () => {
  it('[TC-VIEW-46] FR-VIEW-04: 조각은 12시에서 시계 방향으로 빈틈없이 놓이고, 보이는 면만 그린다', () => {
    /* ① 몫이 각도가 된다. 한 바퀴를 남김없이 채워야 조각 사이에 틈이 없다. */
    const laid = layoutWedges(
      [
        { id: 'a', amount: 50 },
        { id: 'b', amount: 25 },
        { id: 'c', amount: 25 },
      ],
      100,
    );
    expect(laid[0].start).toBe(90);
    expect(laid[0].end).toBeCloseTo(-90, 9); // 절반이면 반 바퀴
    expect(laid[1].start).toBeCloseTo(laid[0].end, 9); // 앞 조각의 끝이 다음 조각의 시작
    expect(laid[2].end).toBeCloseTo(90 - 360, 9); // 한 바퀴를 채운다

    /* ② 투영. SVG 의 y 는 아래로 자라므로 12시는 중심보다 **위**에 찍혀야 한다. */
    const [tx, ty] = project(90, VIEW.r);
    expect(tx).toBeCloseTo(VIEW.cx, 9);
    expect(ty).toBeCloseTo(VIEW.cy - VIEW.r * TILT, 9);
    expect(project(-90, VIEW.r)[1]).toBeCloseTo(VIEW.cy + VIEW.r * TILT, 9);
    // 기울여 보므로 세로가 가로보다 짧다 — 이것이 '원'이 아니라 '누운 원'으로 보이게 한다.
    expect(project(0, VIEW.r)[0] - VIEW.cx).toBeGreaterThan(VIEW.cy - project(90, VIEW.r)[1]);
    // 벌어지는 방향도 같이 눌린다. 12시 조각은 위로 나간다.
    expect(splitOffset(90, 10).y).toBeLessThan(0);
    expect(splitOffset(90, 10).x).toBeCloseTo(0, 9);

    /* ③ 둘레벽은 원의 **앞쪽 반**만 보인다. */
    expect(visibleArc(wedge(90, 10))).toBeNull(); // 온전히 뒤쪽
    expect(visibleArc(wedge(-190, -260))).toBeNull(); // 왼쪽 뒤도 뒤쪽이다
    expect(visibleArc(wedge(45, -45))).toEqual({ from: 0, to: -45 }); // 앞쪽만 잘라 쓴다
    expect(visibleArc(wedge(0, -180))).toEqual({ from: 0, to: -180 }); // 앞쪽 반 전체

    /* ④ 잘린 면은 그 면이 보는 이를 향할 때만 보인다. */
    expect(showsStartEdge(wedge(180, 100))).toBe(true);
    expect(showsStartEdge(wedge(0, -80))).toBe(false);
    expect(showsEndEdge(wedge(80, 0))).toBe(true);
    expect(showsEndEdge(wedge(-100, -180))).toBe(false);

    /* ⑤ 그리는 차례 — 뒤쪽 조각이 먼저다. SVG 는 나중에 그린 것이 위에 온다. */
    const front = wedge(-45, -135); // 가운데 각 -90 = 앞
    const back = wedge(135, 45); //  가운데 각  90 = 뒤
    expect([front, back].sort(backToFront)[0]).toBe(back);

    /* ⑥ 어떤 조각을 넣어도 경로에 NaN 이 새지 않는다 — 한 글자만 망가져도 통째로 사라진다. */
    for (const w of [wedge(90, -30), wedge(-30, -200), wedge(-200, -270), wedge(90, -270)]) {
      const out = splitOffset(w.mid, 5);
      const paths = [topPath(w, out), edgePath(w.start, out), edgePath(w.end, out), wallPath(w, out)];
      for (const d of paths) {
        if (d === null) continue;
        expect(d.startsWith('M ')).toBe(true);
        expect(d).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});

describe('VIEW 3D 파이의 명암', () => {
  it('[TC-VIEW-47] FR-VIEW-04: 옆면은 윗면보다 어둡기만 하고, 어느 면도 3:1 아래로 내려가지 않는다', () => {
    /*
     * 옆면을 밝게 만드는 순간 ADR-032 가 재서 맞춘 3:1 이 소리 없이 깨진다.
     * 빛은 위에서 오므로 옆면은 어둡기만 하면 되고, 그래서 명암은 **한 방향**이다.
     */
    for (let slot = 0; slot < _slots.HUE_SLOTS; slot++) {
      const { fill, edge } = paletteColor(slot);
      const topContrast = contrastOnWhite(rgbOf(fill));

      const wall = contrastOnWhite(rgbOf(darkenColor(fill, WALL_DARKEN)));
      const cut = contrastOnWhite(rgbOf(darkenColor(fill, EDGE_DARKEN)));
      // 어두워진 면은 흰 바탕에서 늘 윗면보다 잘 보인다.
      expect(wall).toBeGreaterThanOrEqual(topContrast);
      expect(cut).toBeGreaterThanOrEqual(wall);

      /*
       * 파스텔 면은 3:1 에 못 미친다 — 그 몫은 **테두리**가 맡는다(ADR-036).
       * 테두리가 어느 면보다도 진해야 세 면이 모두 테두리 안에 갇힌 것으로 보인다.
       */
      expect(contrastOnWhite(rgbOf(edge))).toBeGreaterThanOrEqual(_slots.MIN_CONTRAST);
      expect(contrastOnWhite(rgbOf(edge))).toBeGreaterThanOrEqual(cut);
    }

    // 세 면의 밝기가 달라야 모서리가 선으로 보인다 — 같으면 두께가 사라진다.
    expect(EDGE_DARKEN).toBeGreaterThan(WALL_DARKEN);
    expect(WALL_DARKEN).toBeGreaterThan(0);

    // 알아보지 못하는 색 형식은 그대로 돌려준다 — 조용히 검정이 되지 않는다.
    expect(darkenColor('url(#x)', 0.5)).toBe('url(#x)');
  });
});
