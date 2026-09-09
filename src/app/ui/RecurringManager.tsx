'use client';

import { useState, useTransition } from 'react';
import type { Category, Direction, RecurringItem } from '@/lib/domain/types';
import { addRecurringAction, removeRecurringAction, toggleRecurringAction } from '../actions';
import { btn, DirectionChip, Field, inputClass, Money } from './atoms';

/**
 * 반복 항목 — FR-ENTRY-12.
 * 등록해 두면 그 날짜에 '후보'로 올라온다. 확인해야 기록이 된다(FR-ENTRY-05).
 */
export function RecurringManager({
  items,
  categories,
}: {
  items: RecurringItem[];
  categories: Category[];
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(items.length === 0);
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [anchorDay, setAnchorDay] = useState('1');

  const pool = categories.filter((c) => c.direction === direction);

  return (
    <div>
      {items.length > 0 ? (
        <ul className="mb-4 divide-y divide-[var(--line)]">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2.5">
              <span className="tabular w-14 shrink-0 text-xs text-[var(--ink-3)]">
                {it.anchorDay}일
              </span>
              <DirectionChip direction={it.direction} />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">{it.name}</span>
              <Money amount={it.amount} direction={it.direction} />
              <button
                type="button"
                className={btn.ghost}
                disabled={pending}
                onClick={() => startTransition(() => toggleRecurringAction(it.id, !it.active))}
              >
                {it.active ? '중지' : '재개'}
              </button>
              <button
                type="button"
                className={btn.danger}
                disabled={pending}
                onClick={() => startTransition(() => removeRecurringAction(it.id))}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!open ? (
        <button type="button" className={btn.soft} onClick={() => setOpen(true)}>
          반복 추가
        </button>
      ) : (
        <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg)] p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="이름">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="넷플릭스"
                className={inputClass}
              />
            </Field>
            <Field label="금액">
              <input
                inputMode="numeric"
                value={amount}
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
            <Field label="기준일">
              <input
                inputMode="numeric"
                value={anchorDay}
                onChange={(e) => setAnchorDay(e.target.value)}
                className={`${inputClass} tabular`}
              />
            </Field>
          </div>

          {msg ? <p className="mt-2 text-xs text-amber-700">{msg}</p> : null}

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={() => setOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className={btn.primary}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await addRecurringAction({
                    name,
                    amount: Number(amount.replace(/[^\d]/g, '')),
                    direction,
                    categoryId: categoryId || null,
                    anchorDay: Number(anchorDay.replace(/[^\d]/g, '')),
                  });
                  if (!r.ok) {
                    setMsg(r.message ?? '값 확인 필요');
                    return;
                  }
                  setMsg(null);
                  setName('');
                  setAmount('');
                })
              }
            >
              추가
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
