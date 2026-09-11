'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Category, RecordEntry } from '@/lib/domain/types';
import { addDays, lastDayOfMonth, parseISODate } from '@/lib/domain/date';
import { holidayName } from '@/lib/domain/holiday';
import { restoreRecordAction } from '../actions';
import { Dialog } from './Dialog';
import { RecordDialog } from './RecordDialog';
import { btn, CategoryChip, Money } from './atoms';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function krDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}
function shortDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}

/**
 * 달력 셀의 짧은 금액 요약 — 재검수 v2 §12.
 *
 * 좁은 화면에서 금액을 전부 지웠더니 "그날 얼마 썼나"를 달력에서 알 수 없었다.
 * 그렇다고 원 단위를 그대로 넣으면 셀을 넘친다. **반올림한 단위 요약**을 쓴다.
 * 숫자 중간을 '−123,4…' 로 자르는 것은 금지한다 — 그것은 값이 아니라 파편이다.
 * 정확한 값은 날짜 상세와 접근성 이름이 늘 제공한다.
 */
export function shortAmount(n: number, tight = false): string {
  const a = Math.abs(n);
  const trim = (v: number) => String(Math.round(v * 10) / 10);
  if (a >= 100_000_000) return `${trim(a / 100_000_000)}억`;
  if (a >= 10_000_000) return `${trim(a / 10_000)}만`;
  if (a >= 10_000) return `${trim(a / 10_000)}만`;
  if (tight && a >= 10_000) return `${trim(a / 10_000)}만`;
  if (tight && a >= 1_000) return `${trim(a / 1_000)}천`;
  return a.toLocaleString('ko-KR');
}

/**
 * 달력 작업 영역 — ADR-021.
 *
 * 기본은 **넓은 월 달력 하나**다. 날짜를 누르면 그날의 상세 창이 열린다.
 * 전에는 상시 340px 상세를 옆에 붙였는데, 조회를 시작하기도 전에 달력의 폭을
 * 뺏었다(재검수 v2 R09).
 */
export function CalendarWorkspace({
  monthKey,
  today,
  initialDate,
  openOnLoad,
  highlightRecordId,
  records,
  categories,
}: {
  monthKey: string;
  today: string;
  initialDate: string;
  openOnLoad: boolean;
  highlightRecordId: string | null;
  records: RecordEntry[];
  categories: Category[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialDate);
  const [detailOpen, setDetailOpen] = useState(openOnLoad);

  useEffect(() => {
    setSelected(initialDate);
    setDetailOpen(openOnLoad);
  }, [initialDate, openOnLoad]);

  const byDate = useMemo(() => {
    const m = new Map<string, RecordEntry[]>();
    for (const r of records) {
      const list = m.get(r.date);
      if (list) list.push(r);
      else m.set(r.date, [r]);
    }
    return m;
  }, [records]);

  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const firstDow = new Date(year, month - 1, 1).getDay();
  const gridStart = addDays(`${monthKey}-01`, -firstDow);
  const cellCount = Math.ceil((firstDow + lastDayOfMonth(year, month)) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => addDays(gridStart, i));


  function choose(date: string) {
    // 옆 달 날짜를 누르면 그 달로 옮기고 그 날짜의 상세를 연다(§9).
    if (date.slice(0, 7) !== monthKey) {
      // 같은 화면에서 달만 옮기는 것이다 — 보던 자리를 지킨다(ADR-038).
      router.push(`/?d=${date}`, { scroll: false });
      return;
    }
    setSelected(date);
    setDetailOpen(true);
  }

  return (
    <>
      <div
        role="grid"
        aria-label={`${year}년 ${month}월 달력`}
        className="overflow-hidden rounded-[var(--r-summary)] border border-[var(--hairline)]"
      >
        {/* 요일 줄은 달력의 머리다. 진한 강조색 면에 흰 글자로 또렷하게 둔다. */}
        <div role="row" className="grid grid-cols-7 bg-[var(--primary)]">
          {DOW.map((d) => (
            <div
              key={d}
              role="columnheader"
              className="py-2 text-center text-[13px] font-semibold text-[var(--primary-ink)]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* 주 단위로 row 를 만든다 — 격자의 행 구조가 실제로 존재해야 한다(v2 R13). */}
        {Array.from({ length: cellCount / 7 }, (_, w) => (
          <div role="row" key={cells[w * 7]} className="grid grid-cols-7">
            {cells.slice(w * 7, w * 7 + 7).map((date) => (
              <DayCell
                key={date}
                date={date}
                inMonth={date.slice(0, 7) === monthKey}
                isToday={date === today}
                isSelected={date === selected}
                list={byDate.get(date) ?? []}
                onChoose={choose}
              />
            ))}
          </div>
        ))}
      </div>


      {detailOpen ? (
        <DayDetailDialog
          date={selected}
          records={byDate.get(selected) ?? []}
          categories={categories}
          highlightRecordId={highlightRecordId}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------- 하루 한 칸 */

function DayCell({
  date,
  inMonth,
  isToday,
  isSelected,
  list,
  onChoose,
}: {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  list: RecordEntry[];
  onChoose: (d: string) => void;
}) {
  const expense = list.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
  const income = list.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);

  /*
   * 쉬는 날 — FR-VIEW-12, ADR-022.
   *
   * 일요일과 관공서 공휴일의 날짜 숫자를 붉게 적는다. 달력에서 붉은 숫자가
   * 휴일이라는 것은 한국에서 따로 배울 것이 없는 약속이다.
   *
   * **다른 달의 날짜에는 붉은색을 주지 않는다.** 그 칸이 먼저 말해야 하는 것은
   * '이 달이 아니다'이고, 흐리게 두는 것이 그 뜻이다. 두 뜻을 한 숫자에 겹쳐
   * 담으면 어느 쪽도 또렷하지 않다.
   *
   * 색만으로 뜻을 전하지 않는다(ADR-020) — 공휴일은 이름을 함께 적고, 일요일은
   * 격자의 첫 칸이라는 자리가 같은 말을 한다. 접근성 이름에도 남긴다.
   */
  const holiday = inMonth ? holidayName(date) : null;
  const isSunday = parseISODate(date).getDay() === 0;
  const restDay = inMonth && (isSunday || holiday !== null);

  // 접근성 이름에는 **정확한 원 단위**를 넣는다. 화면의 요약은 반올림이다(§12).
  const parts = [krDate(date)];
  if (holiday) parts.push(`공휴일 ${holiday}`);
  if (isToday) parts.push('오늘');
  if (isSelected) parts.push('선택한 날짜');
  if (list.length > 0) {
    parts.push(`기록 ${list.length}건`);
    if (income > 0) parts.push(`수입 ${income.toLocaleString('ko-KR')}원`);
    if (expense > 0) parts.push(`지출 ${expense.toLocaleString('ko-KR')}원`);
  } else {
    parts.push('저장한 기록 없음');
  }

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={parts.join(', ')}
      /* 오늘은 current, 선택은 selected 로 나눈다 — 둘은 다른 뜻이다(v2 R14). */
      aria-current={isToday ? 'date' : undefined}
      aria-selected={isSelected}
      onClick={() => onChoose(date)}
      /*
       * flex-col 로 두는 이유 — 브라우저는 <button> 의 내용을 세로 가운데로 민다.
       * 그대로 두면 날짜 숫자가 칸 한가운데 떠서 달력으로 읽히지 않는다.
       */
      className={[
        'relative flex min-h-[62px] flex-col items-start gap-0.5 border-b border-r border-[var(--hairline)] px-0.5 py-1.5 text-left transition-colors min-[360px]:px-1 sm:min-h-[96px] sm:px-2',
        isSelected ? 'bg-[var(--accent-container)]' : inMonth ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)]',
        isSelected ? 'ring-2 ring-inset ring-[var(--primary)]' : 'hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {/*
       * 오늘 표시가 휴일색보다 앞선다 — 파랑은 '지금 있는 곳'이고 그것이 먼저
       * 필요하다(ADR-017). 오늘이 휴일이면 아래의 공휴일 이름이 그 뜻을 잇는다.
       */}
      <span
        className={[
          'inline-grid size-6 shrink-0 place-items-center rounded-full text-[12px] sm:text-[13px]',
          isToday
            ? 'bg-[var(--primary)] font-semibold text-[var(--primary-ink)]'
            : restDay
              ? 'font-semibold text-[var(--holiday)]'
              : inMonth
                ? 'text-[var(--ink)]'
                : 'text-[var(--ink-3)]',
        ].join(' ')}
      >
        {Number(date.slice(8, 10))}
      </span>

      {/*
       * 공휴일의 이름. 색을 보지 못해도 무슨 날인지 읽히게 하는 통로다.
       * 좁은 화면에서는 줄이 넘칠 수 있으므로 한 줄로 자른다 — 잘려도 남는 것이
       * 이름의 앞머리라 뜻이 남는다. 금액과 달리 이름은 잘라도 값이 되지 않는다.
       */}
      {holiday ? (
        <span className="w-full truncate text-[9px] font-medium text-[var(--holiday)] min-[360px]:text-[10px] sm:text-[11px]">
          {holiday}
        </span>
      ) : null}

      {/*
       * 일별 금액 요약 — 좁은 화면에서도 남긴다(v2 R07).
       * 좁을수록 더 짧은 단위를 쓴다. 잘라내지 않는다.
       *
       * **수입이 먼저다.** 들어온 것을 보고 나간 것을 보는 차례이며,
       * 접근성 이름의 차례도 이것과 같게 둔다 — 눈으로 읽는 순서와 귀로 듣는
       * 순서가 다르면 같은 칸을 두 가지로 기억하게 된다.
       */}
      {list.length > 0 ? (
        <span className="flex w-full min-w-0 flex-col gap-px">
          {income > 0 ? (
            <>
              <span className="tabular truncate text-[10px] font-semibold text-[var(--dir-income)] min-[360px]:text-[11px] sm:hidden">
                +{shortAmount(income, true)}
              </span>
              <span className="tabular hidden truncate text-[13px] font-semibold text-[var(--dir-income)] sm:inline">
                +{shortAmount(income)}
              </span>
            </>
          ) : null}
          {expense > 0 ? (
            <>
              <span className="tabular truncate text-[10px] font-semibold text-[var(--dir-expense)] min-[360px]:text-[11px] sm:hidden">
                −{shortAmount(expense, true)}
              </span>
              <span className="tabular hidden truncate text-[13px] font-semibold text-[var(--dir-expense)] sm:inline">
                −{shortAmount(expense)}
              </span>
            </>
          ) : null}
        </span>
      ) : null}

      {/*
       * 건수는 칸의 오른쪽 아래에 둔다. 금액을 밀어내지 않는 자리다.
       * 한 건일 때는 적지 않는다 — '+1' 은 알려 주는 것이 없다.
       * 접근성 이름이 이미 '기록 N건'을 말하므로 화면 표시는 보조다.
       */}
      {list.length > 1 ? (
        <span
          aria-hidden
          className="tabular absolute bottom-1 right-1 text-[10px] text-[var(--ink-3)] sm:text-[11px]"
        >
          +{list.length}
        </span>
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------- 날짜 상세 */

function DayDetailDialog({
  date,
  records,
  categories,
  highlightRecordId,
  onClose,
}: {
  date: string;
  records: RecordEntry[];
  categories: Category[];
  highlightRecordId: string | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<RecordEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [undo, setUndo] = useState<RecordEntry | null>(null);
  const [undoPending, startUndo] = useTransition();

  useEffect(() => setUndo(null), [date]);

  const expense = records.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
  const income = records.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);
  const holiday = holidayName(date);

  return (
    <>
      <Dialog
        open={editing === null && !adding}
        onClose={onClose}
        title={shortDate(date)}
        /*
         * 부제는 '2건' 같은 세어 놓은 수가 아니다 — 목록이 바로 아래에 있고
         * 세는 일은 눈이 한다. 여기에 둘 값이 있다면 그날이 무슨 날인가다.
         */
        subtitle={holiday ?? undefined}
        width="md"
        footer={
          <>
            <span className="flex-1" />
            {/*
             * 창 바닥의 동작은 낱말이다(ADR-027). 아이콘은 자리가 좁은 목록 줄에서만
             * 쓴다 — 바닥에는 낱말을 넣을 자리가 있고, 낱말이 있으면 뜻이 추측이
             * 되지 않는다. 진한 채움 대신 옅은 면을 쓰는 것은 그대로다.
             */}
            <button type="button" className={btn.soft} onClick={() => setAdding(true)}>
              기록 추가
            </button>
          </>
        }
      >
        {/*
         * 지출·수입·합계 — 셋은 **같은 넓이의 세 칸**을 나눠 갖는다(§12).
         *
         * `grid-cols-3` 은 `minmax(0,1fr)` 셋이므로 값이 길어져도 칸이 밀리지
         * 않는다. 대신 칸을 넘칠 수 있어서, 좁은 화면에서는 글자를 한 단계
         * 줄여 자리를 만든다 — 금액은 말줄임하지 않는다(ADR-020).
         * 세로 실선을 둬서 셋이 대등하다는 것이 눈에도 보이게 한다.
         */}
        <dl className="mb-4 grid grid-cols-3 rounded-[var(--r-control)] bg-[var(--surface-2)] py-3">
          {/*
           * 차례는 **수입 · 지출 · 합계**다. 달력 칸과 같은 차례여야 한다 —
           * 같은 하루를 두 곳에서 다른 순서로 보여 주면 눈이 매번 다시 찾는다.
           * 합계는 앞의 둘에서 나오는 값이므로 마지막이다.
           */}
          {(
            [
              { label: '수입', amount: income, direction: 'income' as const, signed: false },
              { label: '지출', amount: expense, direction: 'expense' as const, signed: false },
              { label: '합계', amount: income - expense, direction: undefined, signed: true },
            ]
          ).map((col, i) => (
            <div
              key={col.label}
              className={[
                'min-w-0 px-1.5 text-center sm:px-4',
                /* 실선은 --line 을 쓴다. --hairline 은 surface-2 위에서 보이지 않는다. */
                i > 0 ? 'border-l border-[var(--line)]' : '',
              ].join(' ')}
            >
              <dt className="text-[13px] text-[var(--ink-2)]">{col.label}</dt>
              <dd className="mt-0.5">
                <Money
                  amount={col.amount}
                  direction={col.amount === 0 ? undefined : col.direction}
                  signed={col.signed}
                  className="text-[14px] sm:text-[15px]"
                />
              </dd>
            </div>
          ))}
        </dl>

        {/*
         * 창의 크기를 **고정한다** — ADR-028.
         *
         * 전에는 최소 높이만 줬는데, 그러면 기록이 다섯을 넘는 날에는 창이 그만큼
         * 자란다. 같은 자리를 눌러도 매번 다른 크기의 창이 뜨면 다음에 누를 곳의
         * 위치가 날마다 바뀐다 — 최소 높이를 준 애초의 이유가 그것이었다(ADR-021).
         *
         * 다섯 줄까지 보이고 그보다 많으면 **목록 안에서 굴린다.**
         * 줄 하나가 48px 이므로 48×5 + 줄 사이 실선 4개 = 244px 이다.
         */}
        <div className="h-[244px] overflow-y-auto">
        {/*
         * 기록이 없는 날에는 **아무 글자도 두지 않는다**(ADR-029).
         *
         * `FR-VIEW-07` 이 금지하는 것은 "이 기간에 거래가 없었다"고 **단정하는
         * 표현**이다. 비워 두는 것은 아무것도 단정하지 않으므로 그 금지에 걸리지
         * 않는다. 오히려 이 창에서는 빈 자리가 더 정확하다 — 창의 높이가 고정되어
         * 있어(ADR-028) 빈 자리 자체가 "여기에 들어올 것이 없다"를 보여 주고,
         * 그 위의 합계가 이미 0원이라고 말한다. 같은 말을 세 번 하지 않는다.
         *
         * 내역 화면은 다르다. 거기서는 사용자가 **조건을 걸어 찾은** 결과가 0건이라
         * 왜 비었는지를 말해 줘야 한다 — 그래서 `EmptyNote` 가 그대로 남아 있다.
         */}
        {records.length === 0 ? null : (
          <ul className="flex flex-col">
            {records.map((r) => {
              const cat = categories.find((c) => c.id === r.categoryId);
              return (
                <li key={r.id} className="border-b border-[var(--hairline)] last:border-0">
                  {/*
                   * 줄을 누르는 것은 **고치려는 것**이다(ADR-024). 읽기만 하는
                   * 화면을 한 겹 더 두지 않는다 — 아래에 이미 보이는 값을 다시
                   * 보여 주려고 누름을 한 번 더 받지 않는다.
                   */}
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    aria-label={`${r.note || '내용 없음'} 기록 고치기`}
                    className={[
                      'flex w-full flex-col rounded-[var(--r-control)] px-3 py-3 text-left transition-colors hover:bg-[var(--surface-2)]',
                      r.id === highlightRecordId ? 'bg-[var(--accent-container)]' : '',
                    ].join(' ')}
                  >
                    {/*
                     * 한 줄이다: 분류 · 내용 · 금액.
                     * '지출'·'수입' 낱말은 적지 않는다 — 금액의 부호가 이미 말한다.
                     * 분류를 내용 앞에 두면 무엇에 쓴 돈인지가 먼저 읽힌다.
                     */}
                    <span className="flex items-center gap-2">
                      <CategoryChip name={cat ? cat.name : '태그 없음'} />
                      {/*
                       * 적은 내용이 없으면 '내용 없음'이라고 쓰지 않는다 — 없다는
                       * 사실을 낱말로 채우면 있는 줄보다 오히려 눈에 걸린다.
                       * 자리만 지키는 '-' 를 흐리게 둔다. 낭독기에는 위의
                       * `aria-label` 이 '내용 없음'으로 말한다.
                       */}
                      <span
                        className={[
                          'min-w-0 flex-1 truncate text-[15px]',
                          r.note ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]',
                        ].join(' ')}
                      >
                        {r.note || '-'}
                      </span>
                      {r.imageId ? (
                        <span className="shrink-0 text-[13px] text-[var(--ink-2)]">영수증</span>
                      ) : null}
                      <Money amount={r.amount} direction={r.direction} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>

        {/*
         * 되돌리기는 목록 밖에 둔다. 목록 안에 두면 서버가 목록을 다시 내려보낼 때
         * 그 줄과 함께 사라져 회복 경로가 없어진다(ADR-019).
         */}
        {undo ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--r-control)] bg-[var(--warn-bg)] px-3.5 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--warn-ink)]">
              기록을 삭제했어요. 이 날짜를 벗어나면 되돌리기가 사라져요.
            </span>
            <button
              type="button"
              className={btn.soft}
              disabled={undoPending}
              onClick={() =>
                startUndo(async () => {
                  await restoreRecordAction(undo.id);
                  setUndo(null);
                })
              }
            >
              되돌리기
            </button>
          </div>
        ) : null}
      </Dialog>

      {editing ? (
        <RecordDialog
          date={date}
          record={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDeleted={(r) => {
            setUndo(r);
            setEditing(null);
          }}
        />
      ) : null}

      {adding ? (
        <RecordDialog date={date} categories={categories} onClose={() => setAdding(false)} />
      ) : null}
    </>
  );
}
