'use client';

import { useState, useTransition } from 'react';
import { clearBudgetAction, setBudgetAction } from '../actions';
import { btn, inputClass } from './atoms';

/**
 * 예산 설정 — FR-VIEW-08.
 * 예산을 지우는 것과 0 으로 두는 것을 다른 동작으로 둔다. 두 상태의 뜻이 다르기 때문이다.
 */
export function BudgetEditor({
  categories,
  current,
  periodKey,
}: {
  categories: { id: string; name: string }[];
  current: { categoryId: string; budget: number | null }[];
  periodKey: string;
}) {
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const set = new Map(current.map((c) => [c.categoryId, c.budget]));

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-[var(--ink-2)]">예산 설정</p>
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            const b = set.get(e.target.value);
            setAmount(b != null ? String(b) : '');
          }}
          className={`${inputClass} w-40`}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          inputMode="numeric"
          value={amount}
          placeholder="예: 300000"
          onChange={(e) => setAmount(e.target.value)}
          className={`${inputClass} tabular w-40`}
        />
        <button
          type="button"
          className={btn.primary}
          disabled={pending || !categoryId}
          onClick={() =>
            startTransition(async () => {
              const n = Number(amount.replace(/[^\d]/g, ''));
              const r = await setBudgetAction(categoryId, periodKey, Number.isFinite(n) ? n : 0);
              setMsg(r.ok ? '저장됨' : (r.message ?? '저장 실패'));
            })
          }
        >
          저장
        </button>
        <button
          type="button"
          className={btn.ghost}
          disabled={pending || !categoryId}
          onClick={() =>
            startTransition(async () => {
              await clearBudgetAction(categoryId, periodKey);
              setAmount('');
              setMsg('예산 없음으로 변경됨');
            })
          }
        >
          예산 삭제
        </button>
      </div>
      {msg ? <p className="mt-2 text-xs text-[var(--ink-3)]">{msg}</p> : null}
    </div>
  );
}
