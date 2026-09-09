import Link from 'next/link';
import { getDb } from '@/lib/db';
import { buildHomeState } from '@/lib/app/home';
import { listCategories } from '@/lib/repo/categories';
import { queryRecords, totalsInRange } from '@/lib/repo/records';
import { endOfMonth, todayISO } from '@/lib/domain/date';
import { CalendarBoard } from './ui/CalendarBoard';
import { PromptBar } from './ui/PromptBar';
import { Money, Panel } from './ui/atoms';

export const dynamic = 'force-dynamic';

function shiftMonth(monthKey: string, delta: number): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7)) - 1 + delta;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const today = todayISO();
  const monthKey = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);

  const db = getDb();
  const state = buildHomeState(db, today);
  const categories = listCategories(undefined, db);

  const from = `${monthKey}-01`;
  const to = endOfMonth(from);
  const records = queryRecords({ from, to, limit: 2000 }, db).items;
  const totals = totalsInRange(from, to, db);

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4">
      <Panel className="!p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <Link
              href={`/?m=${shiftMonth(monthKey, -1)}`}
              aria-label="이전 달"
              className="grid size-9 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)]"
            >
              ‹
            </Link>
            <h1 className="px-1 text-lg font-semibold tracking-tight">
              {Number(monthKey.slice(0, 4))}년 {Number(monthKey.slice(5, 7))}월
            </h1>
            <Link
              href={`/?m=${shiftMonth(monthKey, 1)}`}
              aria-label="다음 달"
              className="grid size-9 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)]"
            >
              ›
            </Link>
            {monthKey !== today.slice(0, 7) ? (
              <Link href="/" className="ml-1 rounded-full px-3 py-1 text-xs text-[var(--primary)] hover:bg-[var(--primary-soft)]">
                이번 달
              </Link>
            ) : null}
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="text-[var(--ink-3)]">지출</span>
              <Money amount={totals.expense} direction="expense" className="text-base" />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[var(--ink-3)]">수입</span>
              <Money amount={totals.income} direction="income" className="text-base" />
            </span>
          </div>
        </div>

        <CalendarBoard
          monthKey={monthKey}
          today={today}
          records={records}
          categories={categories}
        />
      </Panel>

      <div className="min-h-4 flex-1" />

      <PromptBar
        categories={categories}
        pending={state.candidates}
        imageNotice={state.imageNotice}
        usesNetwork={state.provider.usesNetwork}
        outbound={state.outbound}
      />
    </div>
  );
}
