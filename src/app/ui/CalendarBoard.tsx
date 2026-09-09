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

  return (
    <>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--line)]">
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
          if (!date) return <div key={`e${i}`} className="min-h-28 bg-[var(--surface)] opacity-60" />;
          const list = byDate.get(date) ?? [];
          const expense = list.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
          const income = list.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);
          const isToday = date === today;

          return (
            <button
              key={date}
              type="button"
              onClick={() => setOpenDate(date)}
              className="group min-h-28 bg-[var(--surface)] p-2 text-left transition-colors hover:bg-[var(--bg)]"
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
                <div className="mt-1.5 space-y-1">
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

      <p className="mt-3 text-[11px] text-[var(--ink-3)]">빈 날은 기록 없음. 지출이 없었다는 뜻은 아님.</p>

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
  const [adding, setAdding] = useState(records.length === 0);
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;

  const expense = records.filter((r) => r.direction === 'expense').reduce((s, r) => s + r.amount, 0);
  const income = records.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0);

  return (
    <Dialog
      open
      onClose={onClose}
      title={label}
      subtitle={records.length > 0 ? `${records.length}건` : '기록 없음'}
      width="lg"
      footer={
        <>
          <span className="mr-auto flex items-center gap-3 text-xs">
            {expense > 0 ? <Money amount={expense} direction="expense" /> : null}
            {income > 0 ? <Money amount={income} direction="income" /> : null}
          </span>
          {!adding ? (
            <button type="button" className={btn.soft} onClick={() => setAdding(true)}>
              추가
            </button>
          ) : null}
          <button type="button" className={btn.ghost} onClick={onClose}>
            닫기
          </button>
        </>
      }
    >
      {records.length === 0 && !adding ? <EmptyNote /> : null}

      {records.length > 0 ? (
        <ul className="divide-y divide-[var(--line)]">
          {records.map((r) => (
            <RecordItem key={r.id} record={r} categories={categories} tagIndex={tagIndex} />
          ))}
        </ul>
      ) : null}

      {adding ? (
        <ManualForm date={date} categories={categories} onDone={() => setAdding(false)} />
      ) : null}
    </Dialog>
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
    <li className="group flex items-center gap-3 py-3">
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

/** 수동 입력 — 원칙 3. 자동이 실패해도 길이 끊기지 않는다(FR-ENTRY-08). */
function ManualForm({
  date,
  categories,
  onDone,
}: {
  date: string;
  categories: Category[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');

  const pool = categories.filter((c) => c.direction === direction);

  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg)] p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="금액">
          <input
            inputMode="numeric"
            value={amount}
            placeholder="8000"
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} tabular`}
          />
        </Field>
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

      {msg ? <p className="mt-2 text-xs text-amber-700">{msg}</p> : null}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={btn.ghost} onClick={onDone}>
          취소
        </button>
        <button
          type="button"
          className={btn.primary}
          disabled={pending}
          onClick={() =>
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
              onDone();
            })
          }
        >
          저장
        </button>
      </div>
    </div>
  );
}
