'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Category, Direction, RecordEntry } from '@/lib/domain/types';
import { createRecordAction, deleteRecordAction, restoreRecordAction, updateRecordAction } from '../actions';
import { Dialog } from './Dialog';
import { btn, DirectionChip, EmptyNote, Field, inputClass, Money, TagChip } from './atoms';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 달력 — 이 제품의 중심 화면.
 * 날짜를 누르면 그날의 팝업이 열리고, 거기서 수동 기록의 추가·수정·삭제가 모두 끝난다.
 * 자동 입력은 아래 프롬프트가 맡는다.
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
  const dayCount = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: dayCount }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const tagIndex = new Map(categories.map((c, i) => [c.id, i]));
  const rowCount = cells.length / 7;

  return (
    <>
      {/*
       * 남는 세로 공간을 달력이 가져간다 — 달력과 아래 입력줄 사이에 빈 띠가 생기면
       * 화면의 중심이 어디인지 흐려진다. 요일 줄만 auto 고 날짜 줄은 균등 분배다.
       */}
      <div
        style={{ gridTemplateRows: `auto repeat(${rowCount}, minmax(0, 1fr))` }}
        className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--line)]"
      >
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`bg-[var(--surface)] py-2.5 text-center text-xs font-medium ${
              i === 0 ? 'text-[var(--dir-expense)]' : i === 6 ? 'text-[var(--primary)]' : 'text-[var(--ink-3)]'
            }`}
          >
            {d}
          </div>
        ))}

        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} className="min-h-20 bg-[var(--surface)] opacity-60" />;
          const list = byDate.get(date) ?? [];
          const expense = list.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
          const income = list.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);
          const isToday = date === today;

          return (
            <button
              key={date}
              type="button"
              onClick={() => setOpenDate(date)}
              /*
               * flex-col 로 두는 이유 — 브라우저는 <button> 의 내용을 세로 가운데로 민다.
               * 그대로 두면 날짜 숫자가 칸 한가운데 떠서 달력으로 읽히지 않는다.
               */
              className="group flex min-h-20 flex-col items-start bg-[var(--surface)] p-1.5 text-left transition-colors hover:bg-[var(--bg)]"
            >
              <span
                className={[
                  'inline-grid size-7 place-items-center rounded-full text-[13px] transition-colors',
                  isToday
                    ? 'bg-[var(--primary)] font-semibold text-[var(--primary-ink)]'
                    : 'text-[var(--ink-2)] group-hover:bg-[var(--line)]',
                ].join(' ')}
              >
                {Number(date.slice(8, 10))}
              </span>

              {list.length > 0 ? (
                <div className="mt-1 w-full space-y-0.5">
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
                  <p className="truncate text-[11px] text-[var(--ink-3)]">{list.length}건</p>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/*
       * 빈 칸에 아무것도 그리지 않는다. FR-VIEW-07 이 금지하는 것은 "거래가 없었다"고
       * 단정하는 표현이지 설명 문구의 부재가 아니다. 날짜 팝업의 EmptyNote 가
       * 그 구분을 계속 맡는다.
       */}
      {openDate ? (
        <DayDialog
          date={openDate}
          records={byDate.get(openDate) ?? []}
          categories={categories}
          tagIndex={tagIndex}
          onClose={() => setOpenDate(null)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ 날짜 팝업 */

function DayDialog({
  date,
  records,
  categories,
  tagIndex,
  onClose,
}: {
  date: string;
  records: RecordEntry[];
  categories: Category[];
  tagIndex: Map<string, number>;
  onClose: () => void;
}) {
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const dow = d.getDay();

  const expense = records.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
  const income = records.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-baseline gap-2">
          {d.getMonth() + 1}월 {d.getDate()}일
          <span
            className={[
              'text-sm font-medium',
              dow === 0
                ? 'text-[var(--dir-expense)]'
                : dow === 6
                  ? 'text-[var(--primary)]'
                  : 'text-[var(--ink-3)]',
            ].join(' ')}
          >
            {DOW[dow]}
          </span>
        </span>
      }
      /* 0 건일 때 여기와 목록이 같은 말을 두 번 하지 않게 비운다 */
      subtitle={records.length > 0 ? `${records.length}건` : undefined}
      width="lg"
      /* 저장 영역은 스크롤과 무관하게 늘 바닥에 붙어 있다 */
      footerClassName="rounded-b-[var(--r-lg)] bg-[var(--bg)]"
      footer={<ManualForm date={date} categories={categories} />}
    >
      <div className="mb-3 flex items-stretch gap-2">
        <DaySummary label="지출" amount={expense} direction="expense" />
        <DaySummary label="수입" amount={income} direction="income" />
        <DaySummary label="잔액" amount={income - expense} />
      </div>

      {/*
       * 목록의 높이를 고정한다 — 기록 수에 따라 팝업이 커졌다 작아졌다 하면
       * 같은 자리를 눌러도 매번 다른 크기의 창이 뜬다.
       */}
      <div className="h-[248px] overflow-y-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg)] px-3">
        {records.length === 0 ? (
          <div className="grid h-full place-items-center">
            <EmptyNote />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {records.map((r) => (
              <RecordItem key={r.id} record={r} categories={categories} tagIndex={tagIndex} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

/** 그날의 합계 한 칸. 방향의 의미색을 옅게 깔아 숫자보다 먼저 읽히게 한다. */
function DaySummary({
  label,
  amount,
  direction,
}: {
  label: string;
  amount: number;
  direction?: Direction;
}) {
  const tint =
    direction === 'expense'
      ? 'var(--dir-expense)'
      : direction === 'income'
        ? 'var(--dir-income)'
        : 'var(--primary)';
  return (
    <div
      className="flex-1 rounded-[var(--r-md)] px-3.5 py-2.5"
      style={{ background: `color-mix(in oklch, ${tint} 9%, var(--surface))` }}
    >
      <p className="text-[11px] font-medium" style={{ color: tint }}>
        {label}
      </p>
      <p className="mt-0.5">
        {/* 0 에 부호를 붙이면 '−0원' 이 되어 뜻 없는 기호가 남는다 */}
        {amount === 0 ? (
          <span className="tabular text-[15px] font-semibold text-[var(--ink-3)]">0원</span>
        ) : (
          <Money amount={amount} direction={direction} className="text-[15px]" />
        )}
      </p>
    </div>
  );
}

function RecordItem({
  record,
  categories,
  tagIndex,
}: {
  record: RecordEntry;
  categories: Category[];
  tagIndex: Map<string, number>;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState(false);

  const [amount, setAmount] = useState(String(record.amount));
  const [categoryId, setCategoryId] = useState(record.categoryId ?? '');
  const [note, setNote] = useState(record.note);

  const cat = categories.find((c) => c.id === record.categoryId);
  const pool = categories.filter((c) => c.direction === record.direction);

  if (removed) {
    return (
      <li className="flex items-center justify-between gap-3 py-3 text-sm text-[var(--ink-2)]">
        <span>삭제됨</span>
        <button
          type="button"
          className={btn.soft}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await restoreRecordAction(record.id);
              setRemoved(false);
            })
          }
        >
          복원
        </button>
      </li>
    );
  }

  if (editing) {
    return (
      <li className="py-3">
        <div className="grid grid-cols-3 gap-2">
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} tabular`}
          />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">태그 없음</option>
            {pool.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
        <div className="mt-2 flex justify-end gap-2">
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
    <li
      className="group flex items-center gap-3 border-l-[3px] py-3 pl-3"
      style={{
        borderLeftColor:
          record.direction === 'income' ? 'var(--dir-income)' : 'var(--dir-expense)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <DirectionChip direction={record.direction} />
          <span className="truncate text-sm">{record.note || '내용 없음'}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {cat ? <TagChip name={cat.name} index={tagIndex.get(cat.id) ?? 0} /> : (
            <span className="text-[11px] text-[var(--ink-3)]">태그 없음</span>
          )}
          {record.imageId ? (
            <a
              href={`/api/image/${record.imageId}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[var(--primary)] underline-offset-2 hover:underline"
            >
              영수증
            </a>
          ) : null}
        </div>
      </div>

      <Money amount={record.amount} direction={record.direction} />

      <div className="flex shrink-0 items-center gap-1">
        <button type="button" className={btn.ghost} onClick={() => setEditing(true)}>
          수정
        </button>
        <button
          type="button"
          className={btn.danger}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await deleteRecordAction(record.id);
              if (r.ok) setRemoved(true);
            })
          }
        >
          삭제
        </button>
      </div>
    </li>
  );
}

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
    });
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-9">
        <div className="sm:col-span-2">
          <Field label="금액">
            <input
              inputMode="numeric"
              value={amount}
              placeholder="8000"
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} tabular`}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="수입/지출">
            <select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as Direction);
                setCategoryId('');
              }}
              className={inputClass}
            >
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
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
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button type="button" className={`${btn.primary} w-full`} disabled={pending} onClick={save}>
            저장
          </button>
        </div>
      </div>

      {msg ? <p className="mt-2 text-xs text-amber-700">{msg}</p> : null}
    </div>
  );
}
