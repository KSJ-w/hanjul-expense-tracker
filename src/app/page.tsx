import Link from 'next/link';
import { getDb } from '@/lib/db';
import { buildHomeState } from '@/lib/app/home';
import { listCategories } from '@/lib/repo/categories';
import { queryRecords } from '@/lib/repo/records';
import { addDays, lastDayOfMonth, parseISODate, todayISO } from '@/lib/domain/date';
import { CalendarWorkspace } from './ui/CalendarWorkspace';
import { PromptDock } from './ui/PromptDock';
import { iconBtn } from './ui/atoms';

export const dynamic = 'force-dynamic';

function shiftMonth(monthKey: string, delta: number): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7)) - 1 + delta;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 달력 — 이 제품의 홈(ADR-021).
 *
 * 위에서부터 월 이동 → **큰 달력**이고, 기록 입력은 화면 하단에 떠 있는
 * 프롬프트가 맡는다. 달력 위에 입력 카드를 두지 않는다(재검수 v2 §8).
 *
 * 월 합계는 여기 두지 않는다 — 기간 합계를 읽는 일은 '분석'이 맡는다.
 * 달력 화면은 날짜를 찾고 기록하는 데 쓴다.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; d?: string; r?: string; back?: string }>;
}) {
  const sp = await searchParams;
  const today = todayISO();

  const pickedDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '') ? sp.d! : null;
  const monthKey = pickedDate
    ? pickedDate.slice(0, 7)
    : /^\d{4}-\d{2}$/.test(sp.m ?? '')
      ? sp.m!
      : today.slice(0, 7);

  const db = getDb();
  const state = buildHomeState(db, today);
  const categories = listCategories(undefined, db);

  const from = `${monthKey}-01`;

  /*
   * 격자에는 앞뒤 달의 날짜도 나오고 누를 수 있다. 그 칸의 기록도 읽어야 하므로
   * 조회 범위를 격자 전체로 넓힌다 — 달 범위만 읽으면 앞뒤 달 칸이 빈 날처럼
   * 보인다. 찾지 못한 것과 없는 것은 다르다(FR-VIEW-07).
   */
  const firstDow = parseISODate(from).getDay();
  const gridStart = addDays(from, -firstDow);
  const cellCount =
    Math.ceil((firstDow + lastDayOfMonth(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)))) / 7) * 7;
  const gridEnd = addDays(gridStart, cellCount - 1);

  const records = queryRecords({ from: gridStart, to: gridEnd, limit: 3000 }, db).items;

  const isThisMonth = monthKey === today.slice(0, 7);
  const monthLabel = `${Number(monthKey.slice(0, 4))}년 ${Number(monthKey.slice(5, 7))}월`;

  return (
    <div className="has-dock flex flex-col gap-4">
      {sp.back ? (
        <Link href={`/search?${sp.back}`} className="w-fit text-[15px] text-[var(--primary)] hover:underline">
          ← 검색 결과로 돌아가기
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold tracking-tight sm:text-[26px]">{monthLabel}</h1>
        <div className="flex items-center gap-0.5">
          <Link href={`/?m=${shiftMonth(monthKey, -1)}`} scroll={false} className={iconBtn} aria-label="이전 달">
            ‹
          </Link>
          <Link
            href="/"
            scroll={false}
            className="flex h-11 items-center rounded-[var(--r-pill)] px-3 text-[15px] text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            이번 달
          </Link>
          <Link href={`/?m=${shiftMonth(monthKey, 1)}`} scroll={false} className={iconBtn} aria-label="다음 달">
            ›
          </Link>
        </div>
      </div>


      {/*
       * 달력을 다른 판으로 감싸지 않는다. 격자가 이미 자기 테두리를 가지고 있고,
       * 감싸면 프롬프트와 좌우 끝이 어긋난다(§7).
       */}
      <div className="mt-1">
        <CalendarWorkspace
          monthKey={monthKey}
          today={today}
          initialDate={initialDateOf(pickedDate, isThisMonth, today, from)}
          openOnLoad={pickedDate !== null}
          highlightRecordId={sp.r ?? null}
          records={records}
          categories={categories}
        />
      </div>

      <PromptDock
        categories={categories}
        pending={state.candidates}
        imageNotice={state.imageNotice}
      />
    </div>
  );
}

/** 선택 날짜의 기본값: 이 달에 오늘이 있으면 오늘, 없으면 그 달의 첫날(§9). */
function initialDateOf(picked: string | null, isThisMonth: boolean, today: string, first: string): string {
  if (picked) return picked;
  return isThisMonth ? today : first;
}
