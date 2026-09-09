import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getCategoryName, listCategories } from '@/lib/repo/categories';
import { categoryBreakdown, periodSeries, queryRecords, totalsForPeriod } from '@/lib/repo/records';
import { budgetComparison } from '@/lib/repo/budgets';
import { periodRange, todayISO, type PeriodType } from '@/lib/domain/date';
import type { Direction, RecordQuery } from '@/lib/domain/types';
import { btn, DirectionChip, EmptyNote, inputClass, Money, Panel, PanelTitle, TagChip } from '../ui/atoms';
import { BudgetBars, CategoryDonut, TrendBars } from '../ui/Charts';
import { BudgetEditor } from '../ui/BudgetEditor';

export const dynamic = 'force-dynamic';

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

  const monthKey = today.slice(0, 7);
  const budgets = budgetComparison(monthKey, db).map((b) => ({
    categoryId: b.categoryId,
    name: getCategoryName(b.categoryId, db) ?? '삭제된 태그',
    budget: b.budget,
    spent: b.spent,
  }));
  const categories = listCategories(undefined, db);
  const expenseTags = categories.filter((c) => c.direction === 'expense');

  // 검색 — FR-VIEW-06
  const q: RecordQuery = {
    from: sp.from || undefined,
    to: sp.to || undefined,
    categoryId: sp.cat || undefined,
    direction: (sp.dir as Direction) || undefined,
    amountMin: sp.min ? Number(sp.min) : undefined,
    amountMax: sp.max ? Number(sp.max) : undefined,
    text: sp.q || undefined,
    limit: 200,
  };
  const searching = Boolean(sp.from || sp.to || sp.cat || sp.dir || sp.min || sp.max || sp.q);
  const found = searching ? queryRecords(q, db) : null;

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

      <Panel>
        <PanelTitle hint={monthKey}>예산</PanelTitle>
        <BudgetBars rows={budgets.map(({ name, budget, spent }) => ({ name, budget, spent }))} />
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <BudgetEditor
            categories={expenseTags.map((c) => ({ id: c.id, name: c.name }))}
            current={budgets.map((b) => ({ categoryId: b.categoryId, budget: b.budget }))}
            periodKey={monthKey}
          />
        </div>
      </Panel>

      <Panel>
        <PanelTitle hint={found ? `${found.items.length}건` : '조건 입력'}>검색</PanelTitle>

        <form method="get" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <input type="hidden" name="p" value={period} />
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">시작</span>
            <input type="date" name="from" defaultValue={sp.from ?? ''} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">끝</span>
            <input type="date" name="to" defaultValue={sp.to ?? ''} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">수입/지출</span>
            <select name="dir" defaultValue={sp.dir ?? ''} className={inputClass}>
              <option value="">전체</option>
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">태그</span>
            <select name="cat" defaultValue={sp.cat ?? ''} className={inputClass}>
              <option value="">전체</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">최소</span>
            <input name="min" inputMode="numeric" defaultValue={sp.min ?? ''} className={`${inputClass} tabular`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">최대</span>
            <input name="max" inputMode="numeric" defaultValue={sp.max ?? ''} className={`${inputClass} tabular`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">내용</span>
            <input name="q" defaultValue={sp.q ?? ''} placeholder="회식" className={inputClass} />
          </label>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-7">
            <button type="submit" className={btn.primary}>
              검색
            </button>
            <Link href={`/dashboard?p=${period}`} className={btn.ghost}>
              초기화
            </Link>
          </div>
        </form>

        {found ? (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            {found.items.length === 0 ? (
              <EmptyNote title="조건에 맞는 기록 없음" hint="조건 변경 후 재검색. 거래가 없었다는 뜻은 아님." />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {found.items.map((r) => {
                  const cat = categories.find((c) => c.id === r.categoryId);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <Link
                        href={`/?m=${r.date.slice(0, 7)}`}
                        className="tabular w-24 shrink-0 text-xs text-[var(--primary)] underline-offset-2 hover:underline"
                      >
                        {r.date}
                      </Link>
                      <DirectionChip direction={r.direction} />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.note || '내용 없음'}</span>
                      {cat ? <TagChip name={cat.name} index={categories.indexOf(cat)} /> : null}
                      <Money amount={r.amount} direction={r.direction} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
