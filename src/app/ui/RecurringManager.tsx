'use client';

import { useState, useTransition } from 'react';
import type { Category, Direction, RecurringItem } from '@/lib/domain/types';
import { addRecurringAction, removeRecurringAction, toggleRecurringAction } from '../actions';
import { btn, Field, inputClass, Money, StatusMessage } from './atoms';

/**
 * 반복 기록 — FR-ENTRY-12, ADR-020.
 *
 * 예정일에 **저장 전 확인 목록에 추가**된다. 자동으로 확정되지 않는다(FR-ENTRY-05).
 * 그래서 '자동 등록'이라고 부르지 않는다(§16).
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
    <div className="flex flex-col gap-4">
      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--line)] py-3 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-[15px]">{it.name}</span>
              <span className="text-[13px] text-[var(--ink-2)]">매월 {it.anchorDay}일</span>
              <span className="text-[13px] text-[var(--ink-2)]">{it.active ? '켜짐' : '멈춤'}</span>
              <Money amount={it.amount} direction={it.direction} />
              <button
                type="button"
                className={btn.ghost}
                disabled={pending}
                onClick={() => startTransition(() => toggleRecurringAction(it.id, !it.active))}
              >
                {it.active ? '멈추기' : '다시 켜기'}
              </button>
              <button
                type="button"
                className={btn.ghost}
                disabled={pending}
                onClick={() => startTransition(() => removeRecurringAction(it.id))}
              >
                목록에서 지우기
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-[13px] text-[var(--ink-3)]">
        멈추면 예정일이 와도 목록에 올라오지 않아요. 목록에서 지워도 이미 저장한 기록은 그대로예요.
        29·30·31일처럼 그 달에 없는 날짜는 그 달의 마지막 날로 당겨서 올라와요.
      </p>

      {!open ? (
        <button type="button" className={btn.outline} onClick={() => setOpen(true)}>
          반복 기록 추가
        </button>
      ) : (
        <div className="rounded-[var(--r-control)] bg-[var(--surface-2)] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="이름" htmlFor="rec-name">
              <input
                id="rec-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="넷플릭스"
                className={inputClass}
              />
            </Field>
            <Field label="금액" htmlFor="rec-amount">
              <input
                id="rec-amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputClass} tabular`}
              />
            </Field>
            <Field label="수입과 지출" htmlFor="rec-direction">
              <select
                id="rec-direction"
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
            <Field label="분류" htmlFor="rec-category">
              <select
                id="rec-category"
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
            <Field label="매월 기록일" htmlFor="rec-day" hint="1부터 31까지 정할 수 있어요.">
              <input
                id="rec-day"
                inputMode="numeric"
                value={anchorDay}
                onChange={(e) => setAnchorDay(e.target.value)}
                className={`${inputClass} tabular`}
              />
            </Field>
          </div>

          {msg ? (
            <div className="mt-3">
              <StatusMessage tone="warn">{msg}</StatusMessage>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
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
                    setMsg(r.message ?? '값을 다시 확인해 주세요.');
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
