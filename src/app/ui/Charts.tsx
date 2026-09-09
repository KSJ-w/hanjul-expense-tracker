'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatWon, Money } from './atoms';

/**
 * 차트 — ADR-020, 검수 §14.
 *
 * 함정: SVG 의 fill 은 CSS 속성이 아니라 **XML 속성**이라 var() 를 해석하지 못한다.
 * 그래서 토큰을 문자열로 넘기기 전에 실행 시점에 실제 색으로 풀어 준다.
 *
 * 색만으로 계열을 구분하지 않는다. 이름과 금액을 글자로 함께 둔다.
 * hover 로만 값을 보게 하지 않는다 — 표가 늘 함께 있다.
 */
const TOKEN_KEYS = ['--dir-expense', '--dir-income', '--chart-1', '--ink-3', '--line', '--surface'];

/** globals.css 와 같은 값이어야 한다. 다르면 첫 프레임만 옛 색으로 그려진다. */
const FALLBACK: Record<string, string> = {
  '--dir-expense': '#bb3e50',
  '--dir-income': '#18765a',
  '--chart-1': '#4f5fe8',
  '--ink-3': '#667085',
  '--line': '#dde3ee',
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

/* ------------------------------------------------------------- 분류별 지출 */

export interface CategoryAmount {
  id: string;
  name: string;
  amount: number;
}

/**
 * 분류별 지출 — 내림차순 가로 막대.
 *
 * 도넛을 기본에서 내렸다: 작은 지출이 0% 로 사라지고, 범례와 금액이 멀어져
 * "무엇에 얼마를 썼나"라는 질문에 답하지 못했다(검수 V11).
 * 0 보다 큰데 반올림으로 0% 가 되는 값은 '1% 미만'으로 적는다.
 */
export function CategoryBars({ rows }: { rows: CategoryAmount[] }) {
  const [expanded, setExpanded] = useState(false);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  if (rows.length === 0 || total === 0) {
    return <p className="py-8 text-center text-[15px] text-[var(--ink-2)]">이 기간에 저장한 지출이 없어요.</p>;
  }

  const sorted = [...rows].sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const TOP = 6;
  const shown = expanded ? sorted : sorted.slice(0, TOP);
  const max = sorted[0].amount;

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {shown.map((r) => {
          const ratio = r.amount / total;
          const percentText = ratio > 0 && ratio < 0.01 ? '1% 미만' : `${Math.round(ratio * 100)}%`;
          return (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--ink)]">{r.name}</span>
                <span className="flex items-baseline gap-2">
                  <span className="tabular text-[13px] text-[var(--ink-3)]">{percentText}</span>
                  {/* 제목이 '분류별 지출'이라 방향을 말한다. 숫자는 중립색으로 둔다(§14). */}
                  <span className="tabular whitespace-nowrap font-semibold text-[var(--ink)]">
                    {formatWon(r.amount)}
                  </span>
                </span>
              </div>
              {/*
               * 막대 길이는 **가장 큰 분류 대비**다. 옆의 %는 전체 대비다.
               * 둘의 분모가 다르므로 이 차트는 '금액 비교'로 읽히게 두고,
               * 비중은 숫자로만 말한다(§14).
               * 최소 길이를 키워 실제보다 큰 비중처럼 보이게 하지 않는다.
               */}
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                {/* 차트 전용 계열색. 거래 방향의 빨강을 여기서 되풀이하지 않는다(§14). */}
                <div
                  className="h-full rounded-full bg-[var(--chart-1)]"
                  style={{ width: `${(r.amount / max) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {sorted.length > TOP ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-4 text-[15px] text-[var(--primary)] underline"
        >
          {expanded ? '상위 분류만 보기' : `모든 분류 보기 (${sorted.length}개)`}
        </button>
      ) : null}
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
export function TrendBars({ data }: { data: TrendPoint[] }) {
  const tokens = useTokens();

  if (data.length === 0) {
    return <p className="py-8 text-center text-[15px] text-[var(--ink-2)]">비교할 기간이 부족해요.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="h-56 w-full">
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
              width={52}
              tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 10000)}만` : String(v))}
            />
            <Tooltip
              cursor={{ fill: tokens['--line'], opacity: 0.4 }}
              contentStyle={{
                background: tokens['--surface'],
                border: `1px solid ${tokens['--line']}`,
                borderRadius: 8,
                fontSize: 13,
              }}
              formatter={(v, name) => [formatWon(Number(v ?? 0)), name === 'expense' ? '지출' : '수입']}
            />
            <Bar dataKey="expense" name="지출" fill={tokens['--dir-expense']} radius={[3, 3, 0, 0]} />
            <Bar dataKey="income" name="수입" fill={tokens['--dir-income']} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[13px] text-[var(--ink-3)]">지출과 수입은 같은 눈금으로 그렸어요.</p>

      {/* 키보드·터치로도 값을 읽을 수 있어야 한다(§14). */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <caption className="sr-only">기간별 지출과 수입</caption>
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[var(--ink-2)]">
              <th scope="col" className="py-2 font-medium">
                기간
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                지출
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                수입
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.label} className="border-b border-[var(--line)] last:border-0">
                <th scope="row" className="py-2 text-left font-normal text-[var(--ink)]">
                  {p.label}
                </th>
                <td className="py-2 text-right">
                  <Money amount={p.expense} direction={p.expense === 0 ? undefined : 'expense'} signed={false} />
                </td>
                <td className="py-2 text-right">
                  <Money amount={p.income} direction={p.income === 0 ? undefined : 'income'} signed={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
