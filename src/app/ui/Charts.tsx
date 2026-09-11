'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatWon } from './atoms';
import {
  backToFront,
  DEPTH,
  EDGE_DARKEN,
  edgePath,
  layoutWedges,
  showsEndEdge,
  showsStartEdge,
  SPLIT,
  SPLIT_HOVER,
  splitOffset,
  TILT,
  topPath,
  VIEW,
  VIEW_HEIGHT,
  WALL_DARKEN,
  wallPath,
} from './pieDepth';
import { darkenColor, type TagPaint } from './tagColor';

/**
 * 차트 — ADR-020, 검수 §14.
 *
 * 함정: SVG 의 fill 은 CSS 속성이 아니라 **XML 속성**이라 var() 를 해석하지 못한다.
 * 그래서 토큰을 문자열로 넘기기 전에 실행 시점에 실제 색으로 풀어 준다.
 *
 * 색만으로 계열을 구분하지 않는다. 이름과 금액을 글자로 함께 둔다.
 * hover 로만 값을 보게 하지 않는다 — 표가 늘 함께 있다.
 */
const TOKEN_KEYS = [
  '--dir-expense',
  '--dir-income',
  '--chart-1',
  '--ink-3',
  '--line',
  '--surface',
];

/** globals.css 와 같은 값이어야 한다. 다르면 첫 프레임만 옛 색으로 그려진다. */
const FALLBACK: Record<string, string> = {
  '--dir-expense': '#bb3e50',
  '--dir-income': '#18765a',
  '--chart-1': '#6366e0',
  '--ink-3': '#667085',
  '--line': '#e0e0ef',
  '--surface': '#ffffff',
};


function useTokens(): Record<string, string> {
  const [tokens, setTokens] = useState<Record<string, string>>(FALLBACK);
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const k of TOKEN_KEYS) next[k] = style.getPropertyValue(k).trim() || FALLBACK[k];
    setTokens(next);
  }, []);
  return tokens;
}

/* --------------------------------------------------------------- 태그별 지출 */

export interface CategoryAmount {
  id: string;
  name: string;
  amount: number;
  /** 태그의 두 색 — 파스텔 면과 같은 색상의 테두리. 서버가 목록의 자리로 정해 넘긴다(ADR-032·ADR-036). */
  paint: TagPaint;
}

export interface TagRecord {
  id: string;
  tagId: string;
  date: string;
  note: string;
  amount: number;
}

const MD = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** 그림자에 쓰는 어두운 색. 실제 색이어야 해서 토큰을 쓰지 않는다. */
const SHADOW_INK = '#101323';

/** 말풍선이 포인터에서 떨어지는 거리. */
const TIP_GAP = 18;

interface Pie3DProps {
  wedges: CategoryAmount[];
  percentOf: (amount: number) => string;
  onPick: (id: string) => void;
}

/**
 * 3D 파이 — ADR-035.
 *
 * recharts 를 쓰지 않고 직접 그린다. 이유는 **그리는 차례** 하나다. 기울여 본
 * 원은 뒤쪽 조각의 옆면부터 앞쪽 조각 순으로 덮어 그려야 하는데(화가의 알고리즘),
 * recharts 는 조각을 데이터 차례로 그리고 그 차례를 바꿀 길을 주지 않는다.
 * 차례가 틀리면 뒤 조각의 옆면이 앞 조각 위로 삐져나와 도형이 깨진다.
 *
 * 조각마다 면이 셋이다 — 윗면 · 둘레벽 · 잘린 면. 셋의 밝기를 다르게 주는 것이
 * 두께를 말한다. 빛은 위에서 오므로 윗면이 가장 밝고, 잘린 면이 가장 어둡다.
 * 어두워지는 쪽으로만 가므로 흰 바탕에서의 3:1 은 그대로 지켜진다(ADR-032).
 *
 * 말풍선도 직접 그린다. 직접 그리니 **포인터의 왼쪽**이라는 규칙을 조각의 중점이
 * 아니라 포인터 자신에 걸 수 있다 — ADR-033 이 recharts 때문에 양보했던 것이다.
 */
function Pie3D({ wedges, percentOf, onPick }: Pie3DProps) {
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  /*
   * 말풍선의 너비를 **재서** 왼쪽에 자리가 있는지 본다. 어림값으로 두었더니
   * 자리가 남는데도 오른쪽으로 넘어갔다(실제로 겪음 — 137px 짜리를 190px 로 봤다).
   * 바뀔 때만 담으므로 렌더가 되풀이되지 않는다.
   */
  const [tipWidth, setTipWidth] = useState(0);
  useLayoutEffect(() => {
    const w = tip.current?.offsetWidth ?? 0;
    if (w > 0 && w !== tipWidth) setTipWidth(w);
  });

  const total = wedges.reduce((sum, w) => sum + w.amount, 0);
  const laid = useMemo(() => layoutWedges(wedges, total), [wedges, total]);

  /* 뒤쪽부터 그린다. 앞 조각이 뒤 조각을 덮어야 두께가 앞뒤로 읽힌다. */
  const order = useMemo(
    () => laid.map((_, i) => i).sort((a, b) => backToFront(laid[a], laid[b])),
    [laid],
  );

  const track = (e: React.MouseEvent, id: string) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const hovered = wedges.find((w) => w.id === hover?.id);
  /* 왼쪽에 자리가 모자라면 오른쪽으로 넘긴다 — 잘려 보이는 것보다 낫다. */
  const tipOnLeft = (hover?.x ?? 0) - TIP_GAP - tipWidth >= 0;

  return (
    <div ref={box} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {/*
       * 자판으로는 아래 목록이 같은 일을 한다(ADR-031). 그림을 낭독기에 한 번 더
       * 읽히면 같은 값을 두 번 듣게 되므로 그림은 숨긴다 — 그 안에 초점을 받는
       * 것이 없어야 하므로 조각에 tabIndex 를 주지 않는다.
       */}
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        className="w-full"
        style={{ height: VIEW_HEIGHT }}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <filter id="pie3d-ground" x="-30%" y="-80%" width="160%" height="320%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* 바닥 그림자 — 원이 어딘가에 놓여 있다는 말이다. */}
        <ellipse
          cx={VIEW.cx}
          cy={VIEW.cy + DEPTH + 6}
          rx={VIEW.r * 0.96}
          ry={VIEW.r * TILT * 0.72}
          fill={SHADOW_INK}
          opacity={0.2}
          filter="url(#pie3d-ground)"
        />

        {order.map((i) => {
          const w = laid[i];
          const slice = wedges[i];
          const out = splitOffset(w.mid, hover?.id === slice.id ? SPLIT_HOVER : SPLIT);
          const wall = wallPath(w, out);
          const { fill } = slice.paint;
          const wallFill = darkenColor(fill, WALL_DARKEN);
          const cutFill = darkenColor(fill, EDGE_DARKEN);

          return (
            <g
              key={slice.id}
              className="cursor-pointer"
              onMouseMove={(e) => track(e, slice.id)}
              onClick={() => onPick(slice.id)}
              /*
               * 조각에 테두리를 두지 않는다(ADR-037). 잠깐 같은 색상의 진한 선을
               * 둘러 봤는데, 파스텔 면 위에서 그 선만 진해 **선이 면보다 먼저**
               * 읽혔다. 원을 나누는 일은 색이 바뀌는 것과 벌어진 틈이 맡는다.
               * 경계의 3:1 은 이 그림에서는 포기한다 — 값은 바로 아래 목록이
               * 글자로 말하고, 범례의 동그라미는 작아서 테를 그대로 둔다(ADR-036).
               */
            >
              {/* 옆면이 먼저다 — 윗면이 그 위를 덮어야 모서리가 깔끔하다. */}
              {showsStartEdge(w) ? <path d={edgePath(w.start, out)} fill={cutFill} /> : null}
              {showsEndEdge(w) ? <path d={edgePath(w.end, out)} fill={cutFill} /> : null}
              {wall ? <path d={wall} fill={wallFill} /> : null}
              <path d={topPath(w, out)} fill={fill} />
            </g>
          );
        })}
      </svg>

      {hovered && hover ? (
        <div
          ref={tip}
          /*
           * 포인터의 **왼쪽**에 띄운다(ADR-033). 오른쪽에 두면 같은 판 오른쪽 칸의
           * 기록 목록을 덮는다 — 무엇을 가리키는지 보려다 무엇을 샀는지를 가린다.
           * 오른쪽 끝을 포인터에 맞추므로 말풍선의 너비를 재지 않아도 된다.
           */
          style={
            tipOnLeft
              ? { right: `calc(100% - ${hover.x - TIP_GAP}px)`, top: hover.y }
              : { left: hover.x + TIP_GAP, top: hover.y }
          }
          className="pointer-events-none absolute z-10 -translate-y-1/2 rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-modal)]"
        >
          <p className="whitespace-nowrap text-[13px] text-[var(--ink-2)]">{hovered.name}</p>
          <p className="tabular whitespace-nowrap text-[15px] font-semibold text-[var(--ink)]">
            {formatWon(hovered.amount)} · {percentOf(hovered.amount)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 태그별 지출 — 원형 파이와 그 태그의 기록(ADR-031).
 *
 * ADR-020 은 도넛을 기각했었다. 이유는 **작은 지출이 0% 로 사라지고, 범례와
 * 금액이 멀어져 "무엇에 얼마를 썼나"에 답하지 못한다**는 것이었다. 그 지적은
 * 지금도 옳으므로 파이 하나만 두지 않는다:
 *
 *   · 파이 **아래에 목록**을 두어 이름·비중·금액을 글자로 함께 적는다.
 *     0 보다 큰데 반올림으로 0% 가 되는 값은 '1% 미만'으로 적는다 — 사라지지 않는다.
 *   · 그 목록은 **고르는 곳이기도 하다.** 조각에 마우스를 올리는 것은 자판으로
 *     할 수 없으므로, 같은 일을 하는 버튼이 반드시 함께 있어야 한다.
 *   · 오른쪽에는 고른 태그의 **기록**이 과거→최신으로 놓인다. 비중이 아니라
 *     "그래서 무엇을 샀나"가 이 화면에서 사람이 다음에 묻는 것이다.
 */
export function CategoryPie({ slices, records }: { slices: CategoryAmount[]; records: TagRecord[] }) {
  const t = useTokens();
  const [picked, setPicked] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...slices].sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id)),
    [slices],
  );
  const total = sorted.reduce((s, r) => s + r.amount, 0);

  /*
   * 고른 것은 **계산해서** 정한다. 부모가 넘긴 배열을 effect 로 state 에 옮기면
   * 배열이 매 렌더 새 참조라 렌더가 무한히 돈다(CandidateReview 에서 겪음).
   * 고른 것이 없거나 사라졌으면 가장 큰 태그를 본다.
   */
  const current = picked !== null && sorted.some((s) => s.id === picked) ? picked : (sorted[0]?.id ?? null);
  const currentSlice = sorted.find((s) => s.id === current);

  if (sorted.length === 0 || total === 0) {
    return <p className="py-8 text-center text-[15px] text-[var(--ink-2)]">이 기간에 저장한 지출이 없어요.</p>;
  }

  const percentOf = (amount: number) => {
    const ratio = amount / total;
    return ratio > 0 && ratio < 0.01 ? '1% 미만' : `${Math.round(ratio * 100)}%`;
  };

  const picks = records.filter((r) => r.tagId === current);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 왼쪽 — 파이와 그 범례 */}
      <div>
        <Pie3D wedges={sorted} percentOf={percentOf} onPick={setPicked} />

        {/*
         * 범례이자 고르는 곳. 조각에 마우스를 올리는 일은 자판으로 할 수 없으므로
         * 같은 일을 하는 버튼을 반드시 둔다.
         *
         * 비중과 금액은 **목록 전체가 함께 쓰는 칸**에 넣는다(ADR-033).
         * 줄마다 제 내용만큼만 자리를 쓰게 두면, 금액이 긴 줄에서 비중이 왼쪽으로
         * 밀려 세로로 읽히지 않는다 — 같은 종류의 숫자가 줄마다 다른 자리에 선다.
         * 비중을 태그 이름 옆에 붙이는 것도 같은 이유로 안 된다. 그러면 이번에는
         * **이름 길이**가 자리를 정한다. 표에서 하는 대로 이름은 왼쪽으로 흐르게
         * 두고 숫자는 제 칸에서 오른쪽으로 맞춘다(ADR-019).
         *
         * `subgrid` 는 <ul> 이 정한 칸을 줄과 버튼에 그대로 물려준다. 칸 너비는
         * 가장 넓은 줄이 정하므로, 금액이 길어지면 모든 줄의 비중이 **함께** 옮겨
         * 간다 — 세로로는 늘 한 자리에 선다. 금액은 여전히 잘리지 않는다(ADR-020).
         */}
        <ul className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto_auto]">
          {sorted.map((s) => (
            <li key={s.id} className="col-span-full grid grid-cols-subgrid">
              <button
                type="button"
                aria-pressed={s.id === current}
                onClick={() => setPicked(s.id)}
                className={[
                  'col-span-full grid grid-cols-subgrid items-baseline gap-x-2 rounded-[var(--r-control)] px-2 py-2 text-left transition-colors',
                  s.id === current ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]',
                ].join(' ')}
              >
                {/* 파이와 같은 옷 — 파스텔 면에 제 색의 테. 테가 없으면 흰 바탕에 녹는다. */}
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 translate-y-px rounded-full"
                  style={{ background: s.paint.fill, boxShadow: `inset 0 0 0 1.5px ${s.paint.edge}` }}
                />
                <span className="min-w-0 truncate text-[15px] text-[var(--ink)]">{s.name}</span>
                <span className="tabular whitespace-nowrap text-right text-[13px] text-[var(--ink-3)]">
                  {percentOf(s.amount)}
                </span>
                {/* 제목이 '태그별 지출'이라 방향을 말한다. 숫자는 중립색으로 둔다(§14). */}
                <span className="tabular whitespace-nowrap text-right font-semibold text-[var(--ink)]">
                  {formatWon(s.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 오른쪽 — 고른 태그의 기록. 과거부터 최신으로. */}
      <div className="lg:border-l lg:border-[var(--hairline)] lg:pl-6">
        {/*
         * 고른 태그의 **합계를 여기에도 적는다**(ADR-034). 왼쪽 범례에 이미 있는
         * 값이지만, 기록을 읽다가 "그래서 다 해서 얼마였지"를 물었을 때 눈이
         * 화면을 가로질러 왼쪽으로 돌아가야 했다 — 같은 물음에 답하는 값은
         * 물음이 생기는 자리에 있어야 한다. 아래 금액들과 같은 오른쪽 끝에
         * 맞춰 두어 그 칸의 합으로 읽히게 한다.
         */}
        {/*
         * 합계 줄과 기록 줄 사이에만 조금 진한 선을 둔다. 선이 없으면 맨 위 금액이
         * 첫 기록의 금액처럼 읽힌다 — 낱말로 '합계'라고 적는 대신 선이 그 일을 한다.
         */}
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-semibold text-[var(--ink)]">
              {currentSlice ? currentSlice.name : '태그'}
            </h3>
            <span className="shrink-0 text-[13px] text-[var(--ink-3)]">{picks.length}건</span>
          </div>
          <span className="tabular shrink-0 whitespace-nowrap text-[17px] font-bold text-[var(--ink)]">
            {formatWon(currentSlice?.amount ?? 0)}
          </span>
        </div>

        <ul className="flex flex-col">
          {picks.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline gap-3 border-b border-[var(--hairline)] py-2.5 last:border-0"
            >
              <span className="tabular shrink-0 text-[13px] text-[var(--ink-3)]">{MD(r.date)}</span>
              <span
                className={[
                  'min-w-0 flex-1 truncate text-[15px]',
                  r.note ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]',
                ].join(' ')}
              >
                {r.note || '-'}
              </span>
              <span className="tabular shrink-0 whitespace-nowrap text-[15px] font-semibold text-[var(--ink)]">
                {formatWon(r.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- 추이 */

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
}

/**
 * 기간 추이 — 지출과 수입을 **같은 눈금**의 한 그래프에 둔다(§14).
 *
 * 전에는 축을 나눠 그렸는데, 그러면 비슷한 높이가 비슷한 금액처럼 보인다.
 * 같은 눈금에 두면 수입이 클 때 지출 막대가 작아지지만 그것이 사실이다.
 * 정확한 값은 아래 표가 늘 함께 제공한다.
 */
/**
 * 막대의 굵기를 재는 데 쓰는 값들. recharts 가 안에서 쓰는 것과 같아야 한다 —
 * 다르면 우리가 정한 굵기가 칸을 넘거나 칸 안에서 헐거워진다.
 */
const AXIS_WIDTH = 52;
const CHART_MARGIN = 8;
const CATEGORY_GAP = 0.1;
const BAR_GAP = 4;

export function TrendBars({ data, slots }: { data: TrendPoint[]; slots: number }) {
  const tokens = useTokens();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  /*
   * 판의 너비를 잰다. 막대 굵기를 **보이는 개수가 아니라 가장 많을 때의 개수**로
   * 정하기 위해서다 — 그러지 않으면 3개월을 고른 순간 막대가 두 배로 굵어진다
   * (recharts 는 남는 자리를 칸 수로 나눠 쓴다).
   *
   * `ResizeObserver` 만으로는 모자란다. 그림이 그려지지 않는 동안에는 그 박자가
   * 오지 않으므로(Dialog 에서 겪은 것과 같다) 효과가 돌 때 한 번 직접 잰다.
   */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 칸 하나의 너비에서 두 막대와 그 사이 틈을 뺀 나머지가 막대 하나의 굵기다. */
  const band = width > 0 ? Math.max(0, width - AXIS_WIDTH - CHART_MARGIN) / Math.max(slots, 1) : 0;
  const barSize = band > 0 ? Math.max(4, Math.floor((band * (1 - CATEGORY_GAP) - BAR_GAP) / 2)) : undefined;

  if (data.length === 0) {
    return <p className="py-8 text-center text-[15px] text-[var(--ink-2)]">비교할 기간이 부족해요.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
       * 눌러도 차트가 **초점을 받지 않게** 한다(ADR-039). recharts 는 자판으로 값을
       * 훑으라고 SVG 에 `tabindex` 와 `role="application"` 을 주는데, 그 role 때문에
       * 브라우저가 마우스 클릭까지 `:focus-visible` 로 쳐서 차트 둘레에 링이 그려진다
       * (실제로 겪음 — 기간 추이 안을 누르면 차트가 통째로 테두리를 얻었다).
       *
       * `mousedown` 의 기본 동작을 막으면 **초점만** 안 간다. Tab 으로 오는 길은
       * 그대로라 자판 사용자는 잃는 것이 없고, 말풍선은 마우스 움직임으로 뜨므로
       * 누르는 사람도 잃는 것이 없다.
       */}
      <div ref={box} className="h-56 w-full" onMouseDown={(e) => e.preventDefault()}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={tokens['--line']} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: tokens['--ink-3'], fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: tokens['--line'] }}
            />
            <YAxis
              tick={{ fill: tokens['--ink-3'], fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={AXIS_WIDTH}
              tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 10000)}만` : String(v))}
            />
            <Tooltip
              /*
               * 가리킨 달의 **칸 전체를 칠하지 않는다**(ADR-037). 띠가 막대보다
               * 넓고 연보라라 그것이 무엇을 뜻하는지 묻게 된다 — 이 화면에서
               * 보라는 '지금 있는 곳'과 주 동작의 색이다(ADR-017).
               * 따라다녀야 하는 것은 값이지 자리가 아니다.
               */
              cursor={false}
              contentStyle={{
                background: tokens['--surface'],
                border: `1px solid ${tokens['--line']}`,
                borderRadius: 8,
                fontSize: 13,
              }}
              /*
               * recharts 가 넘겨 주는 `name` 은 `<Bar name>` 에 적은 **그 이름**이지
               * dataKey 가 아니다. `name === 'expense'` 로 견주던 때에는 그 견줌이
               * 늘 거짓이라 지출까지 '수입'으로 적혔다(실제로 겪음).
               */
              formatter={(v, name) => [formatWon(Number(v ?? 0)), String(name)]}
            />
            {/*
             * 막대를 **자라나게 하지 않는다.** 들어오는 애니메이션은 `requestAnimationFrame`
             * 을 타는데, 그림이 그려지지 않는 동안에는 그 박자가 오지 않아 막대가
             * 높이 0 인 첫 프레임에 멈춘다 — 축과 눈금은 나오는데 막대만 없는
             * 증상으로 보인다(실제로 겪음). 파이도 같은 이유로 애니메이션이 없다.
             */}
            <Bar
              dataKey="expense"
              name="지출"
              fill={tokens['--dir-expense']}
              radius={[3, 3, 0, 0]}
              barSize={barSize}
              isAnimationActive={false}
            />
            <Bar
              dataKey="income"
              name="수입"
              fill={tokens['--dir-income']}
              radius={[3, 3, 0, 0]}
              barSize={barSize}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/*
       * 표를 **화면에서는 뺀다**(ADR-037). 막대 옆에 늘 같은 표가 붙어 있어
       * 같은 값을 두 번 읽게 했다. 다만 ADR-020 이 "hover 로만 값을 보게 하지
       * 않는다"고 한 것은 여전히 옳으므로, 표 자체를 지우지 않고 **낭독기에만**
       * 남긴다 — 마우스를 쓸 수 없는 사람이 값에 닿는 길이다.
       */}
      <table className="sr-only">
        <caption>기간별 지출과 수입</caption>
        <thead>
          <tr>
            <th scope="col">기간</th>
            <th scope="col">지출</th>
            <th scope="col">수입</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{formatWon(p.expense)}</td>
              <td>{formatWon(p.income)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
