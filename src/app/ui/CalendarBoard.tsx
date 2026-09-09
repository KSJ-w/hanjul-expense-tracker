'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Category, Direction, RecordEntry } from '@/lib/domain/types';
import { addDays, lastDayOfMonth, parseISODate } from '@/lib/domain/date';
import { createRecordAction, deleteRecordAction, restoreRecordAction, updateRecordAction } from '../actions';
import { Dialog } from './Dialog';
import { btn, EmptyNote, Field, inputClass, Money, TagChip } from './atoms';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 달력 — 이 제품의 중심 화면.
 *
 * 칸이 담는 것은 **날짜와 그날의 합계**뿐이다(ADR-016). 태그 점·건수·요일 색을
 * 얹어 봤으나 전부 뺐다 — 색과 표시가 늘수록 정작 찾는 금액이 늦게 읽힌다.
 * 색은 금액에만 붙고, 그 색은 거래 방향 하나만 뜻한다(ADR-017).
 *
 * 날짜를 누르면 그날의 팝업이 열리고, 거기서 수동 기록의 추가·수정·삭제가 끝난다.
 */
export function CalendarBoard({
  monthKey,
  today,
  records,
  categories,
}: {
  monthKey: string;
  today: string;
  records: RecordEntry[];
  categories: Category[];
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);

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
  const dayCount = lastDayOfMonth(year, month);

  // 격자는 앞뒤 달의 날짜로 채워 항상 완전한 주가 되게 한다(빈칸을 남기지 않는다).
  const gridStart = addDays(`${monthKey}-01`, -firstDow);
  const cellCount = Math.ceil((firstDow + dayCount) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, i) => addDays(gridStart, i));
  const gridEnd = cells[cells.length - 1];

  return (
    <>
      <div
        style={{ gridTemplateRows: `auto repeat(${cellCount / 7}, minmax(0, 1fr))` }}
        className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--line)]"
      >
        {DOW.map((d) => (
          <div
            key={d}
            className="bg-[var(--surface)] py-2.5 text-center text-xs font-medium text-[var(--ink-3)]"
          >
            {d}
          </div>
        ))}

        {cells.map((date) => (
          <DayCell
            key={date}
            date={date}
            inMonth={date.slice(0, 7) === monthKey}
            isToday={date === today}
            list={byDate.get(date) ?? []}
            onOpen={setOpenDate}
          />
        ))}
      </div>

      {openDate ? (
        <DayDialog
          date={openDate}
          records={byDate.get(openDate) ?? []}
          categories={categories}
          bounds={{ from: gridStart, to: gridEnd }}
          onMove={setOpenDate}
          onClose={() => setOpenDate(null)}
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
  list,
  onOpen,
}: {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  list: RecordEntry[];
  onOpen: (d: string) => void;
}) {
  const expense = list.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
  const income = list.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);

  return (
    <button
      type="button"
      onClick={() => onOpen(date)}
      /*
       * flex-col 로 두는 이유 — 브라우저는 <button> 의 내용을 세로 가운데로 민다.
       * 그대로 두면 날짜 숫자가 칸 한가운데 떠서 달력으로 읽히지 않는다.
       */
      className={[
        'group flex min-h-16 flex-col items-start p-1.5 text-left transition-colors',
        inMonth ? 'bg-[var(--surface)] hover:bg-[var(--bg)]' : 'bg-[var(--bg)] hover:bg-[var(--line)]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-grid size-7 place-items-center rounded-full text-[13px] transition-colors',
          isToday
            ? 'bg-[var(--primary)] font-semibold text-[var(--primary-ink)]'
            : inMonth
              ? 'text-[var(--ink-2)] group-hover:bg-[var(--line)]'
              : 'text-[var(--ink-3)] opacity-45',
        ].join(' ')}
      >
        {Number(date.slice(8, 10))}
      </span>

      {list.length > 0 ? (
        <div className={`mt-1 w-full space-y-0.5 ${inMonth ? '' : 'opacity-45'}`}>
          {expense > 0 ? (
            <p className="tabular truncate text-[12px] font-medium text-[var(--dir-expense)]">
              −{expense.toLocaleString('ko-KR')}
            </p>
          ) : null}
          {income > 0 ? (
            <p className="tabular truncate text-[12px] font-medium text-[var(--dir-income)]">
              +{income.toLocaleString('ko-KR')}
            </p>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ 날짜 팝업 */

function DayDialog({
  date,
  records,
  categories,
  bounds,
  onMove,
  onClose,
}: {
  date: string;
  records: RecordEntry[];
  categories: Category[];
  bounds: { from: string; to: string };
  onMove: (d: string) => void;
  onClose: () => void;
}) {
  const d = parseISODate(date);
  const expense = records.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
  const income = records.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);

  /*
   * 방금 지운 것 — FR-ENTRY-11 의 되살리기가 실제로 닿는 자리(ADR-019).
   *
   * 전에는 지운 줄 자리에 '되돌리기'를 두었으나, 삭제 직후 서버가 목록을 다시
   * 내려보내면서 그 줄이 통째로 사라져 버튼도 함께 없어졌다. 되살릴 방법이
   * 화면에 없었다. 목록 밖의 한 줄로 옮겨 목록이 바뀌어도 남아 있게 한다.
   */
  const [undo, setUndo] = useState<RecordEntry | null>(null);
  const [undoPending, startUndo] = useTransition();
  useEffect(() => setUndo(null), [date]);

  /*
   * 이동 범위를 격자 안으로 묶는다. 밖으로 나가면 그 날의 기록을 읽어 오지 않았으므로
   * 기록이 있어도 "기록 없음"으로 보인다 — 그것은 FR-VIEW-07 이 금지하는 표시다.
   */
  const prev = date > bounds.from ? addDays(date, -1) : null;
  const next = date < bounds.to ? addDays(date, 1) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-1">
          <NavArrow label="이전 날" to={prev} onMove={onMove}>
            ‹
          </NavArrow>
          {/* 자리를 미리 잡는다 — '9월 6일'과 '12월 31일'의 폭이 달라 날을 옮길 때마다
              오른쪽 화살표가 움직인다 */}
          <span className="min-w-[7.5rem] px-1 text-center">
            {d.getMonth() + 1}월 {d.getDate()}일 ({DOW[d.getDay()]})
          </span>
          <NavArrow label="다음 날" to={next} onMove={onMove}>
            ›
          </NavArrow>
        </span>
      }
      /* 0 건일 때도 비우지 않는다. 비우면 머리글 높이가 줄어 아래 내용이 통째로 올라온다 */
      subtitle={`${records.length}건`}
      width="lg"
      /* 저장 영역은 스크롤과 무관하게 늘 바닥에 붙어 있다 */
      footerClassName="rounded-b-[var(--r-lg)] bg-[var(--bg)]"
      footer={<ManualForm key={date} date={date} categories={categories} />}
    >
      {/*
       * 그날의 셈 — 셋을 폭 전체에 고르게 나눈다(ADR-019).
       * 왼쪽에 몰아 두면 남는 오른쪽이 비어 보이고, 금액의 자릿수가 늘 때마다
       * 옆 항목이 밀린다. 칸을 1/3 로 고정하면 자릿수가 늘어도 아무것도 움직이지 않는다.
       * 배경에는 색을 깔지 않는다. 색은 금액에만 붙는다(ADR-017).
       */}
      <dl className="mb-4 grid grid-cols-3 divide-x divide-[var(--line)] border-b border-[var(--line)] pb-4">
        <DaySum label="지출" amount={expense} direction="expense" />
        <DaySum label="수입" amount={income} direction="income" />
        <DaySum label="잔액" amount={income - expense} />
      </dl>

      {/*
       * 목록의 높이를 고정한다 — 기록 수에 따라 팝업이 커졌다 작아졌다 하면
       * 같은 자리를 눌러도 매번 다른 크기의 창이 뜨고, 날짜를 옮길 때마다 흔들린다.
       */}
      <div className="h-[236px] overflow-y-auto">
        {records.length === 0 ? (
          <div className="grid h-full place-items-center">
            <EmptyNote />
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {records.map((r) => (
              <RecordRow key={r.id} record={r} categories={categories} onDeleted={setUndo} />
            ))}
          </ul>
        )}
      </div>

      {/* 자리를 늘 잡아 둔다 — 지울 때만 생기면 목록 높이가 그만큼 흔들린다 */}
      <div className="mt-2 min-h-9">
        {undo ? (
          <div className="flex items-center gap-3 rounded-[var(--r-md)] bg-[var(--bg)] px-3.5 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-[var(--ink-2)]">
              삭제됨 · {undo.note || '내용 없음'}
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
      </div>
    </Dialog>
  );
}

function NavArrow({
  label,
  to,
  onMove,
  children,
}: {
  label: string;
  to: string | null;
  onMove: (d: string) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!to}
      onClick={() => to && onMove(to)}
      className="grid size-7 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)] disabled:opacity-25"
    >
      {children}
    </button>
  );
}

/** 그날의 셈 한 항목. 이름표는 중립이고 색은 금액만 가진다. */
function DaySum({
  label,
  amount,
  direction,
}: {
  label: string;
  amount: number;
  direction?: Direction;
}) {
  return (
    <div className="px-4 first:pl-0 last:pr-0">
      <dt className="text-[11px] text-[var(--ink-3)]">{label}</dt>
      <dd className="mt-0.5 truncate">
        <Money amount={amount} direction={amount === 0 ? undefined : direction} className="text-[15px]" />
      </dd>
    </div>
  );
}

/* --------------------------------------------------------------- 기록 한 줄 */

/**
 * 기록 한 줄 — 리스트 항목의 표준 구조를 따른다: 내용(주) · 태그(보조) · 금액(후행).
 *
 * **행마다 수정·삭제 버튼을 두지 않는다.** 기록이 다섯 줄이면 버튼이 열 개가 되어
 * 정작 읽어야 할 금액보다 버튼이 많아진다. 줄 전체가 하나의 누를 곳이고,
 * 누르면 그 줄이 편집 상태로 바뀐다. 삭제는 편집 상태 안에 있다 —
 * 되돌릴 수 없는 동작을 쉬는 상태에서 한 번에 누를 수 있게 두지 않는다.
 */
function RecordRow({
  record,
  categories,
  onDeleted,
}: {
  record: RecordEntry;
  categories: Category[];
  onDeleted: (r: RecordEntry) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  const [amount, setAmount] = useState(String(record.amount));
  const [categoryId, setCategoryId] = useState(record.categoryId ?? '');
  const [note, setNote] = useState(record.note);

  const cat = categories.find((c) => c.id === record.categoryId);
  const pool = categories.filter((c) => c.direction === record.direction);

  if (editing) {
    return (
      <li className="rounded-[var(--r-md)] bg-[var(--bg)] p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Field label="금액">
            <input
              autoFocus
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} tabular`}
            />
          </Field>
          <Field label="태그">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">태그 없음</option>
              {pool.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="내용">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className={btn.danger}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteRecordAction(record.id);
                if (r.ok) onDeleted(record);
              })
            }
          >
            삭제
          </button>
          <span className="flex-1" />
          <button type="button" className={btn.ghost} onClick={() => setEditing(false)}>
            취소
          </button>
          <button
            type="button"
            className={btn.primary}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await updateRecordAction(record.id, {
                  amount: Number(amount.replace(/[^\d]/g, '')),
                  categoryId: categoryId || null,
                  note,
                });
                setEditing(false);
              })
            }
          >
            저장
          </button>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-[var(--ink)]">{record.note || '내용 없음'}</span>
          <span className="mt-1 flex items-center gap-1.5">
            {cat ? (
              <TagChip name={cat.name} />
            ) : (
              <span className="text-[11px] text-[var(--ink-3)]">태그 없음</span>
            )}
            {record.imageId ? (
              <span className="text-[11px] text-[var(--ink-3)]">영수증 있음</span>
            ) : null}
          </span>
        </span>
        {/* 숫자는 오른쪽으로 맞춘다 — 줄마다 자릿수가 달라도 자리가 어긋나지 않는다 */}
        <span className="w-28 shrink-0 text-right">
          <Money amount={record.amount} direction={record.direction} />
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ 수동 입력 */

/**
 * 수동 입력 — 원칙 3. 자동이 실패해도 길이 끊기지 않는다(FR-ENTRY-08).
 *
 * 팝업 바닥에 늘 펼쳐 둔다. '추가'를 눌러야 나타나게 하면 기록이 없는 날에
 * 빈 목록만 보이고 무엇을 해야 하는지가 한 번 더 가려진다.
 */
function ManualForm({ date, categories }: { date: string; categories: Category[] }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  // 팝업이 열리면 금액부터 친다. 첫 칸을 찾아 누르는 동작을 없앤다.
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const pool = categories.filter((c) => c.direction === direction);

  function save() {
    startTransition(async () => {
      const r = await createRecordAction({
        date,
        amount: Number(amount.replace(/[^\d]/g, '')),
        direction,
        categoryId: categoryId || null,
        note,
      });
      if (!r.ok) {
        setMsg(r.message ?? '저장 실패');
        return;
      }
      setMsg(null);
      setAmount('');
      setNote('');
      setCategoryId('');
      amountRef.current?.focus();
    });
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-11">
        <div className="sm:col-span-2">
          <Field label="금액">
            <input
              ref={amountRef}
              inputMode="numeric"
              value={amount}
              placeholder="8000"
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
              }}
              className={`${inputClass} tabular`}
            />
          </Field>
        </div>

        {/*
         * 지출·수입은 둘뿐이라 목록에서 고르게 하지 않는다.
         * 고른 쪽은 강조색으로만 표시한다 — 여기서 적·녹을 쓰면 금액이 가진
         * 방향의 뜻을 버튼이 한 번 더 되풀이한다(ADR-017).
         */}
        <div className="sm:col-span-3">
          <Field label="수입/지출">
            <div className="flex gap-1 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] p-0.5">
              {(['expense', 'income'] as Direction[]).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  aria-pressed={direction === dir}
                  onClick={() => {
                    setDirection(dir);
                    setCategoryId('');
                  }}
                  className={[
                    'flex-1 rounded-[calc(var(--r-sm)-2px)] py-1.5 text-sm transition-colors',
                    direction === dir
                      ? 'bg-[var(--primary)] font-medium text-[var(--primary-ink)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
                  ].join(' ')}
                >
                  {dir === 'expense' ? '지출' : '수입'}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="태그">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClass}
            >
              <option value="">태그 없음</option>
              {pool.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="col-span-2 sm:col-span-2">
          <Field label="내용">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
              }}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="col-span-2 flex items-end sm:col-span-2">
          <button
            type="button"
            className={`${btn.primary} w-full whitespace-nowrap`}
            disabled={pending}
            onClick={save}
          >
            저장
          </button>
        </div>
      </div>

      {/* 자리를 늘 잡아 둔다 — 사유가 뜰 때만 자리가 생기면 팝업 높이가 흔들린다 */}
      <p className="mt-1.5 min-h-4 text-xs text-[var(--dir-expense)]">{msg}</p>
    </div>
  );
}
