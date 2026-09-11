/**
 * 태그의 색 — ADR-032.
 *
 * 태그마다 **자기 색**을 가진다. 한 색의 채도만 달리한 계열색은 쓰지 않는다 —
 * 그것은 '같은 것의 정도 차이'를 뜻하는데 태그는 서로 다른 것이기 때문이다.
 *
 * 색은 **태그 목록에서의 자리**로 정한다. 진짜 난수를 쓰면 같은 태그가 화면을
 * 새로 그릴 때마다 다른 색이 되어 색이 아무 뜻도 갖지 못한다.
 *
 * 처음에는 id 를 섞어 색상환의 한 칸을 골랐는데, 서로 독립인 해시는 **떨어져
 * 앉는 것을 보장하지 못한다** — 실제로 태그 다섯 중 셋이 초록 계열(90°·120°·150°)
 * 로 몰려서 원이 한 덩어리로 보였다. 자리로 정하면 열둘까지는 반드시 다른 색이다.
 * 목록에 없는 태그(보관된 것)만 예전처럼 id 를 섞어 고른다.
 *
 * 나중에 사용자가 직접 고른 색이 생기면 그 값이 이 계산을 대신한다.
 * 그때 고칠 곳이 여기 하나가 되도록 색을 정하는 일을 이 파일에 모아 둔다.
 */

/**
 * 고르는 색상은 **열둘**이고 30° 씩 떨어져 있다.
 *
 * 칸을 더 잘게 나누면 두 태그가 15° 차이로 앉아 **거의 같지만 같지는 않은** 색이
 * 된다(실제로 겪음 — 285° 와 255° 가 서로 1.35:1 이었다). 그것은 겹치는 것보다
 * 나쁘다: 다르다고 말하면서 구별은 안 되기 때문이다. 차라리 대놓고 같은 색이
 * 나오게 두고, 무엇인지는 옆의 이름이 말하게 한다.
 */
/** 한 태그가 쓰는 두 색. 면은 파스텔, 테두리는 같은 색상의 진한 색이다(ADR-036). */
export interface TagPaint {
  fill: string;
  edge: string;
}

const HUE_SLOTS = 12;

/**
 * 면의 색 — **파스텔**(ADR-036).
 *
 * 밝고 눅은 색으로 넓은 면을 칠한다. 태그 색이 칠하는 것은 화면에서 가장 넓은
 * 면(파이 조각)이라, 그 면이 진하면 화면에서 가장 큰 소리가 된다. 읽어야 할
 * 것은 이름과 금액이다(ADR-017).
 *
 * 대신 파스텔은 흰 바탕에서 1.2~1.9:1 밖에 안 된다 — 도형의 **경계**가 흐려진다.
 * 그래서 면과 테두리를 나눈다: 면은 파스텔, 테두리는 같은 색상의 진한 색이다.
 * 지켜야 하는 3:1 은 테두리가 맡는다(TC-VIEW-44).
 */
const FILL = { saturation: 0.62, lightness: 0.82 } as const;

/**
 * 테두리를 만들 때의 채도. 여기서 시작해 흰 바탕에서 3:1 이 될 때까지 어둡게 한다.
 * 면과 **같은 색상**이므로 테두리가 면의 정체를 한 번 더 말한다.
 */
const EDGE_SATURATION = 0.52;

/** 흰 바탕에서 도형이 도형으로 보이는 선(WCAG 1.4.11 비문자 대비). */
const MIN_CONTRAST = 3;

/** FNV-1a. 짧은 문자열을 고르게 흩는다. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** 흰 바탕과의 대비. 1.05 는 흰색의 (휘도 + 0.05) 다. */
export function contrastOnWhite(rgb: [number, number, number]): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

/**
 * 같은 밝기(L)를 줘도 **눈에 보이는 밝기는 색상마다 다르다** — 노랑은 밝고
 * 파랑은 어둡다. 그래서 밝기를 색상별로 어림잡아 되돌리지 않고, **실제 대비를
 * 재서** 기준을 넘을 때까지 어둡게 한다. 어림값은 노랑에서 늘 모자랐다
 * (실제로 겪음 — 노랑 1.73:1 · 초록 2.12:1 로 흰 바탕에서 테두리가 흐려졌다).
 */
function darkenUntilVisible(hue: number, saturation: number): [number, number, number] {
  let l = 0.56;
  let rgb = hslToRgb(hue, saturation, l);
  while (l > 0.18 && contrastOnWhite(rgb) < MIN_CONTRAST) {
    l -= 0.01;
    rgb = hslToRgb(hue, saturation, l);
  }
  return rgb;
}

const css = ([r, g, b]: [number, number, number]) => `rgb(${r} ${g} ${b})`;

const cache = new Map<number, TagPaint>();

/** 태그가 없는 기록의 몫. 뜻이 '없음'이므로 색을 주지 않고 중립으로 둔다. */
export const NO_TAG_PAINT: TagPaint = { fill: 'rgb(216 220 227)', edge: 'rgb(122 130 143)' };

/**
 * 색상환의 `slot` 번째 칸. 이웃한 칸끼리 붙지 않도록 **한 칸씩 건너뛰며** 돈다
 * (0 → 0°, 1 → 150°, 2 → 300° …). 차례로 만든 태그가 나란히 비슷한 색을 받지
 * 않게 하려는 것이다.
 */
export function paletteColor(slot: number): TagPaint {
  const i = ((slot % HUE_SLOTS) + HUE_SLOTS) % HUE_SLOTS;
  const hit = cache.get(i);
  if (hit) return hit;
  const hue = ((i * 5) % HUE_SLOTS) * (360 / HUE_SLOTS);
  const paint: TagPaint = {
    fill: css(hslToRgb(hue, FILL.saturation, FILL.lightness)),
    edge: css(darkenUntilVisible(hue, EDGE_SATURATION)),
  };
  cache.set(i, paint);
  return paint;
}

/**
 * 태그의 색.
 * `slot` 은 사용자의 태그 목록에서의 자리다. 목록에 없으면(보관된 태그) id 를
 * 섞어 아무 칸이나 고른다 — 지난 기록에만 나오므로 겹쳐도 크게 문제되지 않는다.
 */
export function tagColor(id: string, slot?: number): TagPaint {
  if (id === 'none' || id === '') return NO_TAG_PAINT;
  return paletteColor(slot ?? hash(id));
}

/**
 * 색을 검정 쪽으로 섞는다. 3D 파이의 옆면(ADR-035)이 쓴다.
 *
 * **밝게 하는 짝은 두지 않는다.** 태그 색은 흰 바탕에서 3:1 이 되는 **경계의 값**
 * 이라(`darkenUntilVisible`) 조금이라도 밝히면 그 선을 넘는다. 명암을 어둡게만
 * 만들면 대비는 늘 좋아지는 쪽으로만 움직인다 — 그래서 빛은 '밝은 윗면'이 아니라
 * '어두운 옆면'으로 표현한다(TC-VIEW-47).
 */
export function darkenColor(css: string, amount: number): string {
  const m = css.match(/rgb\((\d+) (\d+) (\d+)\)/);
  if (!m) return css;
  const k = 1 - Math.min(Math.max(amount, 0), 1);
  const [r, g, b] = [1, 2, 3].map((i) => Math.round(Number(m[i]) * k));
  return `rgb(${r} ${g} ${b})`;
}

/** 시험이 색상환 전체를 훑을 수 있게 열어 둔다. */
export const _slots = { HUE_SLOTS, FILL, EDGE_SATURATION, MIN_CONTRAST, darkenUntilVisible, hslToRgb };
