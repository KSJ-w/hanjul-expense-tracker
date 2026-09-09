'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * 차트 — ADR-005. 그리는 도구만 가져오고 표현은 우리 토큰으로 통일한다.
 * 색의 원천은 globals.css 의 --cat-* / --dir-* 이다. 여기서 색을 새로 만들지 않는다.
 *
 * 함정: SVG 의 fill 은 CSS 속성이 아니라 **XML 속성**이라 var() 를 해석하지 못한다.
 * 그래서 토큰을 문자열로 넘기기 전에 실행 시점에 실제 색으로 풀어 준다.
 * 이것을 하지 않으면 축과 범례는 나오는데 도형만 보이지 않는다.
 */

const TOKEN_KEYS = [
  ...Array.from({ length: 10 }, (_, i) => `--cat-${i + 1}`),
  '--dir-expense',
  '--dir-income',
];

/** 화면이 그려지기 전에도 쓸 수 있는 대비값. globals.css 와 같은 값을 둔다. */
const FALLBACK: Record<string, string> = {
  '--cat-1': 'oklch(0.62 0.16 255)',
  '--cat-2': 'oklch(0.72 0.15 75)',
  '--cat-3': 'oklch(0.6 0.15 165)',
  '--cat-4': 'oklch(0.66 0.19 20)',
  '--cat-5': 'oklch(0.55 0.17 300)',
  '--cat-6': 'oklch(0.75 0.13 120)',
  '--cat-7': 'oklch(0.68 0.14 210)',
  '--cat-8': 'oklch(0.6 0.13 45)',
  '--cat-9': 'oklch(0.7 0.1 330)',
  '--cat-10': 'oklch(0.5 0.08 260)',
  '--dir-expense': 'oklch(0.58 0.19 15)',
  '--dir-income': 'oklch(0.6 0.13 165)',
};

function useTokens(): Record<string, string> {
  const [tokens, setTokens] = useState<Record<string, string>>(FALLBACK);
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const k of TOKEN_KEYS) {
      const v = style.getPropertyValue(k).trim();
      next[k] = v || FALLBACK[k];
    }
    setTokens(next);
  }, []);
  return tokens;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const short = (n: number) =>
  n >= 100_000_000
    ? `${Math.round(n / 10_000_000) / 10}억`
    : n >= 10_000
      ? `${Math.round(n / 1_000) / 10}만`
      : String(n);

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; payload?: { name?: string } }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-[var(--ink)]">{label ?? payload[0].payload?.name}</p>
      {payload.map((p, i) => (
        <p key={i} className="tabular mt-0.5 text-neutral-600">
          {p.name ? `${p.name} ` : ''}
          {won(p.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

export interface Slice {
  name: string;
  value: number;
}

export function CategoryDonut({ data }: { data: Slice[] }) {
  const tokens = useTokens();
  const catColors = Array.from({ length: 10 }, (_, i) => tokens[`--cat-${i + 1}`]);
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--ink-3)]">이 기간 지출 기록 없음</p>;
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="h-52 w-full sm:w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={catColors[i % catColors.length]} stroke="white" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: catColors[i % catColors.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-[var(--ink-2)]">{d.name}</span>
            <span className="tabular text-[var(--ink-3)]">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
            <span className="tabular w-24 text-right font-medium text-[var(--ink)]">{won(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface TrendPoint {
  label: string;
  income: number;
  expense: number;
}

export function TrendBars({ data }: { data: TrendPoint[] }) {
  const tokens = useTokens();
  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-[var(--ink-3)]">
        비교 기간 부족. 변화가 없다는 뜻은 아님.
      </p>
    );
  }

  // 수입과 지출을 한 축에 두면 큰 쪽이 작은 쪽을 눌러 읽을 수 없게 된다.
  // 월급 320만과 식비 6만을 같은 눈금에 그리면 식비는 사실상 보이지 않는다.
  // 그래서 축을 나눈다 — 비교 대상이 다른 두 이야기이기 때문이다.
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TrendOne data={data} dataKey="expense" label="지출" color={tokens['--dir-expense']} />
      <TrendOne data={data} dataKey="income" label="수입" color={tokens['--dir-income']} />
    </div>
  );
}

function TrendOne({
  data,
  dataKey,
  label,
  color,
}: {
  data: TrendPoint[];
  dataKey: 'income' | 'expense';
  label: string;
  color: string;
}) {
  const empty = data.every((d) => d[dataKey] === 0);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-600">{label}</p>
      <div className="h-44 w-full">
        {empty ? (
          <p className="flex h-full items-center justify-center text-xs text-[var(--ink-3)]">
            {label} 기록 없음
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'oklch(0.55 0.02 260)' }}
              />
              <YAxis
                tickFormatter={short}
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 11, fill: 'oklch(0.65 0.02 260)' }}
              />
              <Tooltip content={<TooltipBox />} cursor={{ fill: 'oklch(0.95 0.005 260)' }} />
              <Bar
                dataKey={dataKey}
                name={label}
                fill={color}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
