import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getCategoryName } from '@/lib/repo/categories';
import { categoryBreakdown, periodSeries, totalsForPeriod } from '@/lib/repo/records';
import { periodRange, todayISO, type PeriodType } from '@/lib/domain/date';
import { Money, Panel, SectionTitle } from '../ui/atoms';
import { CategoryBars, TrendBars } from '../ui/Charts';

export const dynamic = 'force-dynamic';

/**
 * 분석 — 기간 합계·분류별 지출·기간 추이(ADR-020·ADR-021).
 *
 * 기간 이름을 '주/월/연'이 아니라 '이번 주/이번 달/올해'로 말한다(§14).
 * 진행 중인 기간은 어디까지의 값인지 밝힌다 — 완결된 지난 달과 같은 무게로
 * 비교하면 '지출이 줄었다'는 잘못된 인상을 준다.
 */
const TABS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'year', label: '올해' },
];
const SERIES_COUNT: Record<PeriodType, number> = { week: 8, month: 6, year: 3 };

function krRange(from: string, to: string): string {
  const f = `${Number(from.slice(5, 7))}월 ${Number(from.slice(8, 10))}일`;
  const t = `${Number(to.slice(5, 7))}월 ${Number(to.slice(8, 10))}일`;
  return `${from.slice(0, 4)}년 ${f} ~ ${t}`;
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const period: PeriodType = sp.p === 'week' || sp.p === 'year' ? sp.p : 'month';

  const db = getDb();
  const today = todayISO();
  const { from, to } = periodRange(period, today);

  const totals = totalsForPeriod(period, today, db);
  const rows = categoryBreakdown(from, to, 'expense', db).map((s) => ({
    id: s.categoryId ?? 'none',
    name: s.categoryId ? (getCategoryName(s.categoryId, db) ?? '보관한 분류') : '미분류',
    amount: s.amount,
  }));
  const series = periodSeries(period, today, SERIES_COUNT[period], db).map((p) => ({
    label: p.label,
    income: p.income,
    expense: p.expense,
  }));

  // 진행 중인 기간인가. 오늘이 기간 안에 있으면 아직 끝나지 않았다.
  const ongoing = today >= from && today <= to;
  const basis = ongoing ? `${krRange(from, today)} 기준 (아직 진행 중이에요)` : krRange(from, to);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-[24px] font-bold tracking-tight">분석</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* 기간 선택은 둥근 그룹 하나로 묶는다(§14). */}
          <div
            className="flex gap-1 rounded-[var(--r-pill)] bg-[var(--surface-2)] p-1"
            role="group"
            aria-label="기간 선택"
          >
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/dashboard?p=${t.key}`}
                aria-current={period === t.key ? 'true' : undefined}
                className={[
                  'flex h-10 items-center rounded-[var(--r-pill)] px-4 text-[15px] transition-colors',
                  period === t.key
                    ? 'bg-[var(--accent-container)] font-semibold text-[var(--on-accent-container)]'
                    : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
                ].join(' ')}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <p className="text-[13px] text-[var(--ink-2)]">{basis}</p>
        </div>

        {/* 요약은 부드러운 작은 면 세 개(§14). 상시 설명 문장 대신 도움말을 단다. */}
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Panel tone="accent" as="div" className="rounded-[var(--r-summary)] px-4 py-3">
            <dt className="text-[13px] text-[var(--ink-2)]">지출</dt>
            <dd className="mt-0.5">
              <Money
                amount={totals.expense}
                direction={totals.expense === 0 ? undefined : 'expense'}
                signed={false}
                className="text-[24px] sm:text-[28px]"
              />
            </dd>
          </Panel>
          <Panel tone="inset" as="div" className="rounded-[var(--r-summary)] px-4 py-3">
            <dt className="text-[13px] text-[var(--ink-2)]">수입</dt>
            <dd className="mt-0.5">
              <Money
                amount={totals.income}
                direction={totals.income === 0 ? undefined : 'income'}
                signed={false}
                className="text-[18px] sm:text-[22px]"
              />
            </dd>
          </Panel>
          <Panel tone="inset" as="div" className="rounded-[var(--r-summary)] px-4 py-3">
            <dt className="text-[13px] text-[var(--ink-2)]">합계</dt>
            <dd className="mt-0.5">
              <Money amount={totals.net} className="text-[18px] sm:text-[22px]" />
            </dd>
          </Panel>
        </dl>
      </section>

      <Panel className="p-4 sm:p-5">
        <SectionTitle hint={`기록 ${totals.count}건`}>분류별 지출</SectionTitle>
        <CategoryBars rows={rows} />
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionTitle
          hint={period === 'week' ? '최근 8주' : period === 'month' ? '최근 6개월' : '최근 3년'}
        >
          기간 추이
        </SectionTitle>
        <TrendBars data={series} />
      </Panel>
    </div>
  );
}
