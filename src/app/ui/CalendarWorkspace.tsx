'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Category, RecordEntry } from '@/lib/domain/types';
import { addDays, lastDayOfMonth, parseISODate } from '@/lib/domain/date';
import { deleteRecordAction, restoreRecordAction, updateRecordAction } from '../actions';
import { Dialog } from './Dialog';
import { NewRecordDialog } from './NewRecordDialog';
import { btn, CategoryChip, EmptyNote, Field, inputClass, Money, StatusMessage } from './atoms';

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

  const monthCount = cells.filter((d) => d.slice(0, 7) === monthKey).reduce((s, d) => s + (byDate.get(d)?.length ?? 0), 0);

  function choose(date: string) {
    // 옆 달 날짜를 누르면 그 달로 옮기고 그 날짜의 상세를 연다(§9).
    if (date.slice(0, 7) !== monthKey) {
      router.push(`/?d=${date}`);
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

  // 접근성 이름에는 **정확한 원 단위**를 넣는다. 화면의 요약은 반올림이다(§12).
  const parts = [krDate(date)];
  if (isToday) parts.push('오늘');
  if (isSelected) parts.push('선택한 날짜');
  if (list.length > 0) {
    parts.push(`기록 ${list.length}건`);
    if (expense > 0) parts.push(`지출 ${expense.toLocaleString('ko-KR')}원`);
    if (income > 0) parts.push(`수입 ${income.toLocaleString('ko-KR')}원`);
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
      <span
        className={[
          'inline-grid size-6 shrink-0 place-items-center rounded-full text-[12px] sm:text-[13px]',
          isToday
            ? 'bg-[var(--primary)] font-semibold text-[var(--primary-ink)]'
            : inMonth
              ? 'text-[var(--ink)]'
              : 'text-[var(--ink-3)]',
        ].join(' ')}
      >
        {Number(date.slice(8, 10))}
      </span>

      {/*
       * 일별 금액 요약 — 좁은 화면에서도 남긴다(v2 R07).
       * 좁을수록 더 짧은 단위를 쓴다. 잘라내지 않는다.
       */}
      {list.length > 0 ? (
        <span className="flex w-full min-w-0 flex-col gap-px">
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
  const [open, setOpen] = useState<RecordEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [undo, setUndo] = useState<RecordEntry | null>(null);
  const [undoPending, startUndo] = useTransition();

  useEffect(() => setUndo(null), [date]);

  const expense = records.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
  const income = records.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <Dialog
        open={open === null && !adding}
        onClose={onClose}
        title={shortDate(date)}
        subtitle={`${records.length}건`}
        width="md"
        footer={
          <>
            <span className="flex-1" />
            {/* 큰 채움 버튼은 창에서 가장 튀는 것이 되어 버린다. 아이콘 하나로 둔다. */}
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="이 날짜에 기록"
              title="이 날짜에 기록"
              className="grid size-11 place-items-center rounded-full bg-[var(--accent-container)] text-[var(--on-accent-container)] transition-colors hover:brightness-97"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </>
        }
      >
        {/* 상세의 합계는 요약이 아니라 정확한 원 단위다(§12). */}
        <dl className="mb-4 grid grid-cols-3 gap-2 rounded-[var(--r-control)] bg-[var(--surface-2)] px-4 py-3">
          <div>
            <dt className="text-[13px] text-[var(--ink-2)]">지출</dt>
            <dd className="mt-0.5">
              <Money
                amount={expense}
                direction={expense === 0 ? undefined : 'expense'}
                signed={false}
                className="text-[15px]"
              />
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-[var(--ink-2)]">수입</dt>
            <dd className="mt-0.5">
              <Money
                amount={income}
                direction={income === 0 ? undefined : 'income'}
                signed={false}
                className="text-[15px]"
              />
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-[var(--ink-2)]">합계</dt>
            <dd className="tabular mt-0.5">
              <Money amount={income - expense} className="text-[15px]" />
            </dd>
          </div>
        </dl>

        {/*
         * 창의 크기를 처음부터 잡아 둔다. 기록 수에 따라 늘어나면 같은 자리를
         * 눌러도 매번 다른 크기의 창이 뜨고, 날짜를 옮길 때마다 흔들린다.
         */}
        <div className="min-h-[300px]">
        {records.length === 0 ? (
          <EmptyNote />
        ) : (
          <ul className="flex flex-col">
            {records.map((r) => {
              const cat = categories.find((c) => c.id === r.categoryId);
              return (
                <li key={r.id} className="border-b border-[var(--hairline)] last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpen(r)}
                    aria-label={`${r.note || '내용 없음'} 거래 상세 열기`}
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
                      <CategoryChip name={cat ? cat.name : '미분류'} />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--ink)]">
                        {r.note || '내용 없음'}
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

      {open ? (
        <TransactionDialog
          record={open}
          categories={categories}
          onClose={() => setOpen(null)}
          onDeleted={(r) => {
            setUndo(r);
            setOpen(null);
          }}
        />
      ) : null}

      {adding ? (
        <NewRecordDialog date={date} categories={categories} onClose={() => setAdding(false)} />
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- 거래 상세 */

/**
 * 거래 상세 — 줄을 누르면 먼저 **읽는 화면**이 열린다.
 * 누르자마자 모든 칸이 편집 폼으로 바뀌면 사용자가 무엇을 눌렀는지 놀란다.
 */
function TransactionDialog({
  record,
  categories,
  onClose,
  onDeleted,
}: {
  record: RecordEntry;
  categories: Category[];
  onClose: () => void;
  onDeleted: (r: RecordEntry) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(String(record.amount));
  const [categoryId, setCategoryId] = useState(record.categoryId ?? '');
  const [note, setNote] = useState(record.note);
  const [date, setDate] = useState(record.date);

  const cat = categories.find((c) => c.id === record.categoryId);
  const pool = categories.filter((c) => c.direction === record.direction);
  const amountValue = Number(amount.replace(/[^\d]/g, ''));
  const amountError =
    amount.trim() === '' ? '금액을 적어 주세요.' : amountValue <= 0 ? '0보다 큰 금액을 적어 주세요.' : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? '기록 수정' : '거래 상세'}
      subtitle={krDate(record.date)}
      width="md"
      footer={
        editing ? (
          <>
            <span className="flex-1" />
            <button
              type="button"
              className={btn.ghost}
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              취소
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={pending || amountError !== null}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  await updateRecordAction(record.id, {
                    date,
                    amount: amountValue,
                    categoryId: categoryId || null,
                    note,
                  });
                  setEditing(false);
                })
              }
            >
              {pending ? '저장 중' : '저장'}
            </button>
          </>
        ) : (
          <>
            {/* 삭제는 저장·수정과 충분히 떨어뜨린다. 붉은 채움으로 강조하지 않는다. */}
            <button
              type="button"
              className={btn.danger}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteRecordAction(record.id);
                  if (r.ok) onDeleted(record);
                  else setError('삭제하지 못했어요.');
                })
              }
            >
              삭제
            </button>
            <span className="flex-1" />
            <button type="button" className={btn.primary} onClick={() => setEditing(true)}>
              수정
            </button>
          </>
        )
      }
    >
      {error ? (
        <div className="mb-3">
          <StatusMessage tone="error">{error}</StatusMessage>
        </div>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field label="금액" htmlFor="edit-amount" error={amountError ?? undefined}>
            <input
              id="edit-amount"
              autoFocus
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amountError !== null}
              className={`${inputClass} tabular`}
            />
          </Field>
          <Field label="날짜" htmlFor="edit-date">
            <input
              id="edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="분류" htmlFor="edit-category">
            <select
              id="edit-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              <option value="">미분류</option>
              {pool.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="내용" htmlFor="edit-note">
            <input id="edit-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </Field>
          <p className="text-[13px] text-[var(--ink-2)]">
            수입과 지출은 이 화면에서 바꾸지 않아요. 방향을 바꾸려면 지우고 다시 기록해 주세요.
          </p>
        </div>
      ) : (
        <dl className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[13px] text-[var(--ink-2)]">
              {record.direction === 'income' ? '수입' : '지출'}
            </dt>
            <dd>
              <Money amount={record.amount} direction={record.direction} className="text-[24px]" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[13px] text-[var(--ink-2)]">분류</dt>
            <dd className="text-[15px]">{cat ? cat.name : '미분류'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[13px] text-[var(--ink-2)]">내용</dt>
            <dd className="min-w-0 flex-1 text-right text-[15px]">{record.note || '내용 없음'}</dd>
          </div>
          {record.imageId ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-[var(--ink-2)]">영수증</dt>
              <dd>
                <a
                  href={`/api/image/${record.imageId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[15px] text-[var(--primary)] underline"
                >
                  이미지 열기
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </Dialog>
  );
}
