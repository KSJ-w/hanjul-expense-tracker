'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Candidate, Category, Direction } from '@/lib/domain/types';
import { confirmCandidateAction, discardCandidateAction, patchCandidate } from '../actions';
import { Dialog } from './Dialog';
import { btn, Field, inputClass } from './atoms';

/**
 * 확인 팝업 — 원칙 2 / FR-ENTRY-05.
 *
 * 자동 해석은 제안일 뿐이다. 여기서 한 번 보고 눌러야 기록이 된다.
 * 전에는 이것이 별도 페이지의 카드 목록이었는데, 화면을 하나 더 거치게 만들어
 * 마찰이 되었다. 이제 입력 바로 위에 뜨고 닫으면 끝난다.
 */
export function CandidateDialog({
  open,
  candidates,
  categories,
  onClose,
}: {
  open: boolean;
  candidates: Candidate[];
  categories: Category[];
  onClose: () => void;
}) {
  /**
   * 처리한 것을 id 로 기억한다.
   * 후보 배열을 state 로 복사하면 부모가 새 배열을 넘길 때마다 effect 가 돌아
   * 렌더가 무한히 반복된다 — 실제로 그렇게 만들어 화면이 멈췄었다.
   */
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (open) setDone(new Set());
  }, [open]);

  const queue = candidates.filter((c) => !done.has(c.id));

  const remove = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.add(id);
      if (candidates.every((c) => next.has(c.id))) onClose();
      return next;
    });
  };

  return (
    <Dialog
      open={open && queue.length > 0}
      onClose={onClose}
      title="확인"
      subtitle={`${queue.length}건 · 확인해야 저장됨`}
      width="lg"
    >
      <div className="flex flex-col gap-3 pb-2">
        {queue.map((c) => (
          <CandidateForm key={c.id} candidate={c} categories={categories} onDone={() => remove(c.id)} />
        ))}
      </div>
    </Dialog>
  );
}

function CandidateForm({
  candidate,
  categories,
  onDone,
}: {
  candidate: Candidate;
  categories: Category[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(candidate.date ?? '');
  const [amount, setAmount] = useState(candidate.amount != null ? String(candidate.amount) : '');
  const [direction, setDirection] = useState<Direction | ''>(candidate.direction ?? '');
  const [categoryId, setCategoryId] = useState(candidate.categoryId ?? '');
  const [note, setNote] = useState(candidate.note);

  const pool = categories.filter((c) => (direction ? c.direction === direction : true));
  const missing = new Set(candidate.unresolved);
  const flag = (f: string) => (missing.has(f as never) ? 'border-amber-400 bg-amber-50/70' : '');

  return (
    <article className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg)] p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{candidate.rawInput || '수동 입력'}</p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            {candidate.source === 'image'
              ? '영수증'
              : candidate.source === 'recurring'
                ? '반복'
                : '문장'}
            {candidate.merchant ? ` · ${candidate.merchant}` : ''}
          </p>
        </div>
        {missing.size > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            미확정 {missing.size}
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="날짜">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputClass} ${flag('date')}`}
          />
        </Field>
        <Field label="금액">
          <input
            inputMode="numeric"
            value={amount}
            placeholder="미확정"
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} tabular ${flag('amount')}`}
          />
        </Field>
        <Field label="수입/지출">
          <select
            value={direction}
            onChange={(e) => {
              const next = e.target.value as Direction | '';
              setDirection(next);
              if (next && categoryId) {
                const c = categories.find((x) => x.id === categoryId);
                if (c && c.direction !== next) setCategoryId('');
              }
            }}
            className={`${inputClass} ${flag('direction')}`}
          >
            <option value="">미확정</option>
            <option value="expense">지출</option>
            <option value="income">수입</option>
          </select>
        </Field>
        <Field label="태그">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`${inputClass} ${flag('category')}`}
          >
            <option value="">{direction ? '미확정' : '수입/지출 먼저'}</option>
            {pool.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="내용">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-[var(--r-sm)] bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </p>
      ) : null}

      <footer className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          className={btn.ghost}
          disabled={pending}
          onClick={() => startTransition(async () => {
            await discardCandidateAction(candidate.id);
            onDone();
          })}
        >
          취소
        </button>
        <button
          type="button"
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              await patchCandidate(candidate.id, {
                date: date || null,
                amount: amount ? Number(amount.replace(/[^\d]/g, '')) : null,
                direction: direction || null,
                categoryId: categoryId || null,
                note,
              });
              const r = await confirmCandidateAction(candidate.id);
              if (r.ok) onDone();
              else setError(r.message);
            })
          }
        >
          {pending ? '저장 중' : '저장'}
        </button>
      </footer>
    </article>
  );
}
