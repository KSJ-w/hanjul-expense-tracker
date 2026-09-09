import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getCategoryName } from '@/lib/repo/categories';
import { categoryBreakdown, periodSeries, totalsForPeriod } from '@/lib/repo/records';
import { periodRange, todayISO, type PeriodType } from '@/lib/domain/date';
import { Money, Panel, PanelTitle } from '../ui/atoms';
import { CategoryDonut, TrendBars } from '../ui/Charts';

export const dynamic = 'force-dynamic';

/**
 * 대시보드 — 기간 요약만 맡는다(ADR-013).
 * 검색은 자기 탭으로 나갔고, 예산 화면은 ADR-014 로 유보했다.
 */
const TABS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '연' },
];
const SERIES_COUNT: Record<PeriodType, number> = { week: 8, month: 6, year: 3 };

export default async function DashboardPage({
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
  const slices = categoryBreakdown(from, to, 'expense', db).map((s) => ({
    name: s.categoryId ? (getCategoryName(s.categoryId, db) ?? '삭제된 태그') : '태그 없음',
    value: s.amount,
  }));
  const series = periodSeries(period, today, SERIES_COUNT[period], db).map((p) => ({
    label: p.label,
    income: p.income,
    expense: p.expense,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-[var(--surface)] p-1 shadow-[var(--shadow-sm)] ring-1 ring-[var(--line)]">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard?p=${t.key}`}
              aria-current={period === t.key ? 'page' : undefined}
              className={[
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                period === t.key
                  ? 'bg-[var(--primary)] font-medium text-[var(--primary-ink)]'
                  : 'text-[var(--ink-2)] hover:bg-[var(--bg)]',
              ].join(' ')}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <span className="text-xs text-[var(--ink-3)]">
          {from} ~ {to}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="!p-5">
          <p className="text-xs text-[var(--ink-3)]">지출</p>
          <p className="mt-1.5">
            <Money amount={totals.expense} direction="expense" className="text-2xl" />
          </p>
        </Panel>
        <Panel className="!p-5">
          <p className="text-xs text-[var(--ink-3)]">수입</p>
          <p className="mt-1.5">
            <Money amount={totals.income} direction="income" className="text-2xl" />
          </p>
        </Panel>
        <Panel className="!p-5">
          <p className="text-xs text-[var(--ink-3)]">잔액</p>
          <p className="tabular mt-1.5 text-2xl font-semibold">{totals.net.toLocaleString('ko-KR')}원</p>
        </Panel>
      </div>

      <Panel>
        <PanelTitle hint={`${totals.count}건`}>태그별 지출</PanelTitle>
        <CategoryDonut data={slices} />
      </Panel>

      <Panel>
        <PanelTitle hint={period === 'week' ? '최근 8주' : period === 'month' ? '최근 6개월' : '최근 3년'}>
          추이
        </PanelTitle>
        <TrendBars data={series} />
      </Panel>
    </div>
  );
}
