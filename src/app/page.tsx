import Link from 'next/link';
import { getDb } from '@/lib/db';
import { buildHomeState } from '@/lib/app/home';
import { listCategories } from '@/lib/repo/categories';
import { queryRecords, totalsInRange } from '@/lib/repo/records';
import { addDays, endOfMonth, lastDayOfMonth, parseISODate, todayISO } from '@/lib/domain/date';
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

  /*
   * 격자에는 앞뒤 달의 날짜도 흐리게 나온다. 그 칸을 눌러도 그날의 기록이 보여야
   * 하므로 조회 범위를 격자 전체로 넓힌다 — 달 범위만 읽으면 앞뒤 달 칸이
   * "기록 없음"으로 보인다. 그것은 찾지 못한 것이지 없는 것이 아니다(FR-VIEW-07).
   */
  const firstDow = parseISODate(from).getDay();
  const gridStart = addDays(from, -firstDow);
  const cellCount =
    Math.ceil((firstDow + lastDayOfMonth(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)))) / 7) * 7;
  const gridEnd = addDays(gridStart, cellCount - 1);

  const records = queryRecords({ from: gridStart, to: gridEnd, limit: 3000 }, db).items;
  const totals = totalsInRange(from, to, db);

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Panel className="flex flex-1 flex-col !p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
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
            {/* 자리를 늘 잡아 둔다 — 달을 옮길 때만 생기면 달 이름이 좌우로 흔들린다 */}
            <span className="ml-1 inline-block min-w-[4.25rem]">
              {monthKey !== today.slice(0, 7) ? (
                <Link
                  href="/"
                  className="rounded-full px-3 py-1 text-xs text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                >
                  이번 달
                </Link>
              ) : null}
            </span>
          </div>

          {/*
           * 이 달의 셈 — 지출·수입만 두면 남는지 모자라는지를 사용자가 암산해야 한다.
           * 값마다 자리를 잡아 둔다. 달을 옮길 때 자릿수가 달라지면 서로 밀린다.
           */}
          <div className="flex items-center gap-5 text-sm">
            {[
              { label: '지출', amount: totals.expense, direction: 'expense' as const },
              { label: '수입', amount: totals.income, direction: 'income' as const },
              { label: '잔액', amount: totals.income - totals.expense, direction: undefined },
            ].map((s, i) => (
              <span
                key={s.label}
                className={`flex items-center gap-2 ${i === 2 ? 'border-l border-[var(--line)] pl-5' : ''}`}
              >
                <span className="text-[var(--ink-3)]">{s.label}</span>
                <span className="min-w-[7rem] text-right">
                  <Money amount={s.amount} direction={s.direction} className="text-base" />
                </span>
              </span>
            ))}
          </div>
        </div>

        <CalendarBoard
          monthKey={monthKey}
          today={today}
          records={records}
          categories={categories}
        />
      </Panel>

      <PromptBar categories={categories} pending={state.candidates} imageNotice={state.imageNotice} />
    </div>
  );
}
