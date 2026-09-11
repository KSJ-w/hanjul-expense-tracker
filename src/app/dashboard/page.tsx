import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getCategoryName, listCategories } from '@/lib/repo/categories';
import { categoryBreakdown, periodSeries, queryRecords, totalsForPeriod } from '@/lib/repo/records';
import {
  isISODate,
  periodRange,
  shiftPeriod,
  todayISO,
  weekOfMonth,
  type PeriodType,
} from '@/lib/domain/date';
import { Money, Panel, SectionTitle } from '../ui/atoms';
import { CategoryPie, TrendBars } from '../ui/Charts';
import { tagColor } from '../ui/tagColor';

export const dynamic = 'force-dynamic';

/**
 * 통계 — 기간 합계·태그별 지출·기간 추이(ADR-020·ADR-021·ADR-030·ADR-031).
 *
 * 기간은 **종류(주간·월간·연간)와 위치(어느 주·어느 달·어느 해)** 두 가지로
 * 정해진다. 전에는 '이번 주·이번 달·올해'뿐이라 지난 기간을 볼 길이 없었다 —
 * 되짚어 보는 화면인데 지금밖에 볼 수 없었다.
 *
 * 상시로 붙는 설명 문장을 두지 않는다. 사용자가 요청하기 전에는 화면이
 * 스스로를 해설하지 않는다 — 읽을 것은 값이지 값에 대한 말이 아니다.
 */
const TABS: { key: PeriodType; label: string }[] = [
  { key: 'week', label: '주간' },
  { key: 'month', label: '월간' },
  { key: 'year', label: '연간' },
];
/**
 * 추이에서 견주는 기간의 **개수**. 사용자가 두 값 중 하나를 고른다(ADR-037).
 *
 * 둘뿐인 이유는 이 고르기가 화면의 주인공이 아니기 때문이다 — 넷을 두면 그
 * 줄이 제목만큼 넓어진다. 짧게 볼 것인지 길게 볼 것인지, 그 둘이면 된다.
 * 앞의 것이 짧은 쪽, 뒤의 것이 기본값이다.
 */
const SPANS: Record<PeriodType, { count: number; label: string }[]> = {
  week: [
    { count: 4, label: '4주' },
    { count: 8, label: '8주' },
  ],
  month: [
    { count: 3, label: '3개월' },
    { count: 6, label: '6개월' },
  ],
  year: [
    { count: 3, label: '3년' },
    { count: 5, label: '5년' },
  ],
};

const DEFAULT_SPAN: Record<PeriodType, number> = { week: 8, month: 6, year: 3 };

const MD = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;

/**
 * 지금 보고 있는 기간의 이름.
 *
 * 주간만 날짜 범위를 함께 적는다 — '9월 1주차'만으로는 그 이레가 며칠부터인지
 * 알 수 없기 때문이다. 월간·연간은 이름이 곧 범위다.
 */
function periodTitle(type: PeriodType, anchor: string): { label: string; range?: string } {
  if (type === 'week') {
    const { year, month, week } = weekOfMonth(anchor);
    const { from, to } = periodRange('week', anchor);
    return { label: `${year}년 ${month}월 ${week}주차`, range: `${MD(from)} ~ ${MD(to)}` };
  }
  if (type === 'month')
    return { label: `${Number(anchor.slice(0, 4))}년 ${Number(anchor.slice(5, 7))}월` };
  return { label: `${Number(anchor.slice(0, 4))}년` };
}

const UNIT: Record<PeriodType, string> = { week: '주', month: '달', year: '해' };

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const period: PeriodType = sp.p === 'week' || sp.p === 'year' ? sp.p : 'month';

  const db = getDb();
  const today = todayISO();

  /*
   * 앵커는 '어느 기간을 보고 있는가'다. 없으면 오늘이 속한 기간이다.
   * 기간 종류를 바꿀 때는 앵커를 넘기지 않는다 — 8월 3주차를 보다가 '연간'을
   * 누르면 2026년이 나오는 것이 자연스럽다. 종류만 바뀌고 시점은 지금으로 돌아온다.
   */
  const anchor = isISODate(sp.d ?? '') ? sp.d! : today;
  const { from, to } = periodRange(period, anchor);

  const totals = totalsForPeriod(period, anchor, db);
  /*
   * 태그의 색은 **사용자의 태그 목록에서의 자리**로 정한다(ADR-032).
   * 기간마다 보이는 태그가 달라도 색은 그대로여야 하므로, 이 기간의 조각이 아니라
   * 전체 목록을 기준으로 삼는다.
   */
  const slotOf = new Map(listCategories(undefined, db).map((c, i) => [c.id, i]));

  const rows = categoryBreakdown(from, to, 'expense', db).map((s) => ({
    id: s.categoryId ?? 'none',
    name: s.categoryId ? (getCategoryName(s.categoryId, db) ?? '보관한 태그') : '태그 없음',
    amount: s.amount,
    paint: tagColor(s.categoryId ?? 'none', s.categoryId ? slotOf.get(s.categoryId) : undefined),
  }));
  /*
   * 고른 개수는 그 기간 종류가 가진 값 중 하나여야 한다. 주소창에 아무 숫자나
   * 적어 넣어도 화면이 흔들리지 않게, 목록에 없으면 기본값으로 돌아간다.
   */
  const spanOptions = SPANS[period];
  const span = spanOptions.some((o) => String(o.count) === sp.n)
    ? Number(sp.n)
    : DEFAULT_SPAN[period];

  const series = periodSeries(period, anchor, span, db).map((p) => ({
    label: p.label,
    income: p.income,
    expense: p.expense,
  }));

  /*
   * 태그 하나를 고르면 그 태그의 기록이 오른쪽에 놓인다(ADR-031).
   * 조회는 최신순으로 오므로 **뒤집어서** 과거→최신으로 넘긴다.
   */
  const tagRecords = queryRecords({ from, to, direction: 'expense', limit: 2000 }, db)
    .items.map((r) => ({
      id: r.id,
      tagId: r.categoryId ?? 'none',
      date: r.date,
      note: r.note,
      amount: r.amount,
    }))
    .reverse();

  const move = (delta: number) =>
    `/dashboard?p=${period}&d=${shiftPeriod(period, anchor, delta)}&n=${span}`;
  /* 개수를 바꿔도 보고 있던 기간은 그대로 둔다 — 바꾸는 것은 '얼마나 멀리'뿐이다. */
  const spanHref = (count: number) => `/dashboard?p=${period}&d=${anchor}&n=${count}`;

  const title = periodTitle(period, anchor);

  const cols = [
    { label: '수입', amount: totals.income, direction: 'income' as const, signed: false },
    { label: '지출', amount: totals.expense, direction: 'expense' as const, signed: false },
    { label: '합계', amount: totals.net, direction: undefined, signed: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-[24px] font-bold tracking-tight">통계</h1>

        {/* 기간 **종류** — 둥근 그룹 하나로 묶는다(§14). */}
        <div
          className="flex w-fit gap-1 rounded-[var(--r-pill)] bg-[var(--surface-2)] p-1"
          role="group"
          aria-label="기간 단위"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard?p=${t.key}`}
              scroll={false}
              aria-current={period === t.key ? 'true' : undefined}
              className={[
                'flex h-10 items-center rounded-[var(--r-pill)] px-4 text-[15px] transition-colors',
                period === t.key
                  ? 'bg-[var(--accent-container)] font-semibold text-[var(--on-accent-container)]'
                  : 'text-[var(--ink-2)] hover:bg-[var(--surface)]',
              ].join(' ')}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/*
         * 기간 **위치** — 이름을 가운데 두고 좌우로 옮긴다.
         * 이름은 길이가 달라지므로(‘9월 1주차 (08/31 ~ 09/06)’ ↔ ‘2026년’) 가운데
         * 칸이 남는 자리를 모두 가져가게 해서 ‹ › 의 자리를 붙박이로 만든다
         * (ADR-019 — 길이가 변하는 것 때문에 다른 것이 움직이면 안 된다).
         */}
        <div className="flex items-center gap-1">
          <Link
            href={move(-1)}
            scroll={false}
            aria-label={`이전 ${UNIT[period]}`}
            /* 이 화면에서 ‹ › 는 기간을 옮기는 **유일한** 길이다. 글자를 키워 둔다. */
            className="grid size-11 shrink-0 place-items-center rounded-full text-[20px] leading-none text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            ‹
          </Link>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 text-center text-[17px] font-semibold text-[var(--ink)]"
          >
            {/*
             * 두 덩어리를 각각 `whitespace-nowrap` 으로 묶는다. 한국어는 기본으로
             * 아무 글자 사이에서나 줄이 바뀌어서, 그냥 두면 '2026년 9월 2주 / 차'
             * 처럼 낱말 가운데가 갈린다(실제로 겪음). 줄은 **두 덩어리 사이**에서만
             * 바뀌어야 한다.
             */}
            <span className="whitespace-nowrap">{title.label}</span>
            {title.range ? <span className="whitespace-nowrap"> ({title.range})</span> : null}
          </p>
          <Link
            href={move(1)}
            scroll={false}
            aria-label={`다음 ${UNIT[period]}`}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[20px] leading-none text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            ›
          </Link>
        </div>

        {/*
         * 합계 셋 — 흰 바탕 위에 세 칸을 **균등하게** 나눠 가운데로 맞추고,
         * 사이를 옅은 세로 실선으로만 나눈다. 면을 깔거나 칸마다 판을 두르면
         * 셋이 서로 다른 무게로 보인다 — 이 셋은 대등하다(날짜 상세와 같은 꼴).
         *
         * 글자 크기도 셋이 같다. 전에는 지출만 28px 이라 '지출이 이 화면의
         * 주인공'이라고 크기가 말하고 있었다. 셋 중 무엇이 중요한지는 그날의
         * 사용자가 정할 일이다.
         */}
        <dl className="grid grid-cols-3">
          {cols.map((col, i) => (
            <div
              key={col.label}
              className={[
                'min-w-0 px-2 text-center sm:px-4',
                i > 0 ? 'border-l border-[var(--hairline)]' : '',
              ].join(' ')}
            >
              <dt className="text-[13px] text-[var(--ink-2)]">{col.label}</dt>
              <dd className="mt-1">
                <Money
                  amount={col.amount}
                  direction={col.amount === 0 ? undefined : col.direction}
                  signed={col.signed}
                  className="text-[18px] sm:text-[22px]"
                />
              </dd>
            </div>
          ))}
        </dl>

      </section>

      <Panel className="p-4 sm:p-5">
        <SectionTitle hint={`기록 ${totals.count}건`}>태그별 지출</SectionTitle>
        <CategoryPie slices={rows} records={tagRecords} />
      </Panel>

      <Panel className="p-4 sm:p-5">
        {/*
         * 몇 개를 견줄지 고르는 칸 — 낱말이 아니라 **누를 수 있는 것**이다(ADR-037).
         * 전에는 '최근 6개월'이라고 적어 두기만 했다. 읽고 나면 "그럼 3개월은
         * 못 보나" 하는 물음이 남는데 그 물음에 답할 곳이 없었다.
         *
         * 한 상자 안에 둘을 이어 붙이고 사이를 선으로 나눈다. 떨어뜨려 두면
         * 두 개의 다른 단추로 보이지만, 붙여 두면 **하나에서 고르는 것**으로 읽힌다.
         */}
        <SectionTitle
          action={
            <div
              role="group"
              aria-label="견주는 기간"
              className="flex overflow-hidden rounded-[var(--r-control)] border border-[var(--line)]"
            >
              {spanOptions.map((o, i) => (
                <Link
                  key={o.count}
                  href={spanHref(o.count)}
                  scroll={false}
                  aria-current={o.count === span ? 'true' : undefined}
                  className={[
                    'flex h-8 items-center px-3 text-[13px] transition-colors',
                    i > 0 ? 'border-l border-[var(--line)]' : '',
                    o.count === span
                      ? 'bg-[var(--accent-container)] font-semibold text-[var(--on-accent-container)]'
                      : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)]',
                  ].join(' ')}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          }
        >
          기간 추이
        </SectionTitle>
        {/*
         * 막대 굵기는 **가장 많을 때의 칸 수**로 정한다(ADR-037). 보이는 개수로
         * 정하면 3개월을 고른 순간 막대가 두 배로 굵어져, 개수만 바꿨는데 다른
         * 그림을 보는 것처럼 된다.
         */}
        <TrendBars data={series} slots={Math.max(...spanOptions.map((o) => o.count))} />
      </Panel>
    </div>
  );
}
