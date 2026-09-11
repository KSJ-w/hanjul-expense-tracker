/**
 * 파이의 입체 — ADR-035.
 *
 * 원을 **기울여 보는 물체**로 그린다. 평면 원에 명암만 입히는 것으로는(ADR-034)
 * '입체'가 아니라 '색이 어두워진 원'이었다. 여기서는 기하부터 3차원이다:
 * 윗면은 타원으로 눌리고, 조각마다 **옆면**(바깥 둘레벽 + 잘린 두 면)이 선다.
 *
 * ## 좌표 약속
 *
 * 각도는 **수학의 각도**(오른쪽 0°, 반시계 증가)이고, 조각은 12시(90°)에서
 * 시계 방향으로 — 즉 각도가 **줄어드는** 쪽으로 — 돈다. 그래서 이 파일이 다루는
 * 각도는 늘 `(-270, 90]` 안에 있다.
 *
 * 화면으로 옮길 때 y 를 `TILT` 만큼 누르고 **부호를 뒤집는다.** SVG 의 y 는
 * 아래로 자라기 때문이다 — 뒤집지 않으면 원이 위아래가 뒤바뀌어 보인다.
 *
 * ## 무엇이 보이는가
 *
 * 기울여 보므로 보이는 면이 정해져 있다. 안 보이는 면을 그리면 앞면 위로 삐져
 * 나와 도형이 깨진다.
 *
 *   · **둘레벽**은 원의 앞쪽 반만 보인다 — `sin θ < 0`, 곧 `θ ∈ (-180, 0)`.
 *   · **잘린 면**은 그 면이 보는 이를 향할 때만 보인다. 시작 모서리는
 *     `cos θ < 0` 일 때, 끝 모서리는 `cos θ > 0` 일 때다.
 *
 * 이 판정들이 이 파일에 모여 있는 이유는 눈으로 검산할 수 없기 때문이다 —
 * 틀리면 "왜인지 이상한 도형"으로만 보인다. TC-VIEW-46·47 이 값으로 못 박는다.
 */

/**
 * 윗면 타원의 눌림. 1 이면 정면(평면 원), 0 이면 옆에서 본 선이 된다.
 *
 * 이 값 하나가 '얼마나 눕혔는가'를 정한다. 낮추면 더 눕고 높이면 더 선다.
 * 높일 때는 `VIEW` 의 높이도 함께 키운다 — 타원이 세로로 자라기 때문이다.
 */
export const TILT = 0.72;

/** 옆면의 높이(px). */
export const DEPTH = 26;

/** 조각이 늘 벌어져 있는 거리. 벌어져야 **잘린 면**이 보이고, 그것이 두께를 말한다. */
export const SPLIT = 5;

/** 가리킨 조각이 더 벌어지는 거리. */
export const SPLIT_HOVER = 16;

/**
 * 옆면이 윗면보다 어두운 정도. 빛은 위에서 오므로 옆면은 그 빛을 마주보지 않는다.
 *
 * 면이 파스텔이 되면서 이 값을 낮췄다(ADR-036). 세게 어둡게 하면 옆면이
 * **테두리보다 진해져** 테두리가 면에 묻힌다 — 그러면 3:1 을 테두리에 맡긴 것이
 * 헛일이 된다(실제로 겪음, hue 30°에서 잘린 면 5.86 : 테두리 4.19). 옆면은
 * 어느 것도 테두리보다 진하면 안 된다(TC-VIEW-47).
 */
export const WALL_DARKEN = 0.14;

/** 잘린 면은 둘레벽보다도 빛을 덜 받는다 — 세 면의 밝기가 달라야 모서리가 보인다. */
export const EDGE_DARKEN = 0.26;

/** 그림 판의 크기와 원의 자리. SVG `viewBox` 단위다. */
export const VIEW = { w: 300, h: 212, cx: 150, cy: 88, r: 104 } as const;

/**
 * 그림이 차지하는 높이(px). `viewBox` 보다 크게 잡아 **가로에 맞춰 커지게** 한다 —
 * 둘이 같으면 세로에 걸려 판이 넓어져도 원이 자라지 않는다(실제로 겪음).
 */
export const VIEW_HEIGHT = 255;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export interface Wedge {
  id: string;
  /** 시작 각(큰 쪽). */
  start: number;
  /** 끝 각(작은 쪽). 시계 방향이라 `end < start` 다. */
  end: number;
  /** 가운데 각. 벌어지는 방향이자 앞뒤를 가리는 기준이다. */
  mid: number;
}

/**
 * 몫을 각도로 나눈다. 12시에서 시작해 시계 방향으로 돈다.
 *
 * 각도를 뺄셈으로만 쌓는다 — 조각마다 `누적 × 360` 을 다시 계산하면 반올림이
 * 조금씩 어긋나 마지막 조각과 첫 조각 사이에 틈이 생긴다.
 */
export function layoutWedges(amounts: { id: string; amount: number }[], total: number): Wedge[] {
  let angle = 90;
  return amounts.map(({ id, amount }) => {
    const start = angle;
    const end = total > 0 ? start - (amount / total) * 360 : start;
    angle = end;
    return { id, start, end, mid: (start + end) / 2 };
  });
}

/** 각도 `theta`, 반지름 `r` 의 점을 화면 좌표로. `o` 는 조각이 벌어진 만큼이다. */
export function project(theta: number, r: number, o: { x: number; y: number } = { x: 0, y: 0 }): [number, number] {
  return [
    VIEW.cx + o.x + r * Math.cos(toRad(theta)),
    VIEW.cy + o.y - r * Math.sin(toRad(theta)) * TILT,
  ];
}

/** 조각이 제 가운데 각 방향으로 `distance` 만큼 벌어진 이동량. 화면에 눌린 채로 나간다. */
export function splitOffset(mid: number, distance: number): { x: number; y: number } {
  return {
    x: Math.cos(toRad(mid)) * distance,
    y: -Math.sin(toRad(mid)) * distance * TILT,
  };
}

/**
 * 둘레벽에서 **보이는 구간**. 원의 앞쪽 반(`θ ∈ (-180, 0)`)과 겹치는 만큼이다.
 * 겹치는 데가 없으면 `null` — 뒤쪽 조각은 둘레벽을 그리지 않는다.
 */
export function visibleArc(w: Wedge): { from: number; to: number } | null {
  const from = Math.min(w.start, 0);
  const to = Math.max(w.end, -180);
  return to < from ? { from, to } : null;
}

/** 시작 모서리의 잘린 면이 보이는가. 그 면의 바깥 방향이 보는 이를 향할 때다. */
export const showsStartEdge = (w: Wedge): boolean => Math.cos(toRad(w.start)) < 0;

/** 끝 모서리의 잘린 면이 보이는가. */
export const showsEndEdge = (w: Wedge): boolean => Math.cos(toRad(w.end)) > 0;

/**
 * 그리는 차례. SVG 에는 z 축이 없고 **나중에 그린 것이 위에 온다.**
 * 뒤쪽(`sin` 이 큰 쪽) 조각부터 그려야 앞 조각이 그 위를 덮는다.
 */
export const backToFront = (a: Wedge, b: Wedge): number =>
  Math.sin(toRad(b.mid)) - Math.sin(toRad(a.mid));

/* --------------------------------------------------------------- 경로 만들기 */

const arcTo = (from: number, to: number, r: number, o: { x: number; y: number }, sweep: 0 | 1) => {
  const [x, y] = project(to, r, o);
  const large = Math.abs(from - to) > 180 ? 1 : 0;
  return `A ${r} ${r * TILT} 0 ${large} ${sweep} ${x} ${y}`;
};

/** 윗면 — 타원 부채꼴. */
export function topPath(w: Wedge, o: { x: number; y: number }): string {
  const [sx, sy] = project(w.start, VIEW.r, o);
  return `M ${VIEW.cx + o.x} ${VIEW.cy + o.y} L ${sx} ${sy} ${arcTo(w.start, w.end, VIEW.r, o, 1)} Z`;
}

/** 둘레벽 — 보이는 구간만. 위 호를 따라가고 내려간 뒤 아래 호로 되짚어 온다. */
export function wallPath(w: Wedge, o: { x: number; y: number }): string | null {
  const seen = visibleArc(w);
  if (!seen) return null;
  const [ax, ay] = project(seen.from, VIEW.r, o);
  const [bx, by] = project(seen.to, VIEW.r, o);
  const low = { x: o.x, y: o.y + DEPTH };
  return [
    `M ${ax} ${ay}`,
    arcTo(seen.from, seen.to, VIEW.r, o, 1),
    `L ${bx} ${by + DEPTH}`,
    arcTo(seen.to, seen.from, VIEW.r, low, 0),
    'Z',
  ].join(' ');
}

/** 잘린 면 — 중심에서 둘레까지의 평행사변형. */
export function edgePath(theta: number, o: { x: number; y: number }): string {
  const [x, y] = project(theta, VIEW.r, o);
  const cx = VIEW.cx + o.x;
  const cy = VIEW.cy + o.y;
  return `M ${cx} ${cy} L ${x} ${y} L ${x} ${y + DEPTH} L ${cx} ${cy + DEPTH} Z`;
}
