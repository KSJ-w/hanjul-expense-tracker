'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Candidate, Category, Direction } from '@/lib/domain/types';
import { parseISODate } from '@/lib/domain/date';
import { confirmCandidateAction, discardCandidateAction, patchCandidate } from '../actions';
import { Dialog } from './Dialog';
import { btn, Field, inputClass, Money, StatusMessage } from './atoms';
import { Select } from './Select';
import { AmountInput, groupDigits } from './AmountInput';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function krDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '날짜 미정';
  const d = parseISODate(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}

/**
 * 저장 전 확인 — 원칙 2 / FR-ENTRY-05, ADR-020.
 *
 * 자동 해석은 제안일 뿐이다. 여기서 보고 눌러야 기록이 된다.
 * **창을 닫는 일과 항목을 버리는 일을 나눈다**(검수 V07):
 *   상단 X      → 창만 닫는다. 후보는 남고 '저장 전 N건'으로 다시 열 수 있다
 *   나중에 확인 → 이 항목을 남기고 다음으로. 하나뿐이면 창이 닫힌다
 *   이 항목 버리기 → 후보를 지운다. 되돌릴 수 없다(붉은 글자가 그 뜻이다)
 * 하단에 '닫기'를 또 두지 않는다(재검수 v2 R08).
 */
export function CandidateReview({
  open,
  candidates,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  candidates: Candidate[];
  categories: Category[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  /**
   * 처리한 것을 id 로 기억한다.
   * 후보 배열을 state 로 복사하면 부모가 새 배열을 넘길 때마다 effect 가 돌아
   * 렌더가 무한히 반복된다 — 실제로 그렇게 만들어 화면이 멈췄었다.
   */
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [later, setLater] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) {
      setDone(new Set());
      setLater(new Set());
    }
  }, [open]);

  const queue = candidates.filter((c) => !done.has(c.id) && !later.has(c.id));
  const current = queue[0];

  function finish(id: string) {
    setDone((prev) => new Set(prev).add(id));
  }

  useEffect(() => {
    if (open && queue.length === 0 && candidates.length > 0) onClose();
  }, [open, queue.length, candidates.length, onClose]);

  return (
    <Dialog
      open={open && current !== undefined}
      onClose={onClose}
      title="저장 전 확인"
      subtitle={`${queue.length}건 남음 · 확인해야 저장돼요`}
      width="md"
    >
      {current ? (
        <CandidateForm
          key={current.id}
          candidate={current}
          categories={categories}
          onSaved={(msg) => {
            onSaved(msg);
            finish(current.id);
          }}
          onDiscarded={() => finish(current.id)}
          onLater={() => setLater((prev) => new Set(prev).add(current.id))}
        />
      ) : null}
    </Dialog>
  );
}

function CandidateForm({
  candidate,
  categories,
  onSaved,
  onDiscarded,
  onLater,
}: {
  candidate: Candidate;
  categories: Category[];
  onSaved: (message: string) => void;
  onDiscarded: () => void;
  onLater: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const [date, setDate] = useState(candidate.date ?? '');
  const [amount, setAmount] = useState(candidate.amount != null ? groupDigits(String(candidate.amount)) : '');
  const [direction, setDirection] = useState<Direction | ''>(candidate.direction ?? '');
  const [categoryId, setCategoryId] = useState(candidate.categoryId ?? '');
  const [note, setNote] = useState(candidate.note);

  const pool = categories.filter((c) => (direction ? c.direction === direction : true));

  /*
   * 누락은 **지금 입력된 값**으로 판정한다(검수 V18).
   * 최초 해석 결과에 의존하면 값을 고쳐도 경고가 남는다.
   */
  const amountValue = Number(amount.replace(/[^\d]/g, ''));
  const errors = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? null : '날짜를 정해 주세요.',
    amount: amount.trim() === '' ? '금액을 적어 주세요.' : amountValue <= 0 ? '0보다 큰 금액을 적어 주세요.' : null,
    direction: direction === '' ? '수입인지 지출인지 골라 주세요.' : null,
    category: categoryId === '' ? '태그를 선택해 주세요.' : null,
  };
  const missingCount = Object.values(errors).filter(Boolean).length;
  const ready = missingCount === 0;

  const summary = ready
    ? `${direction === 'income' ? '수입' : '지출'} · ${categories.find((c) => c.id === categoryId)?.name ?? '태그 없음'} · ${krDate(date)}`
    : `${missingCount}가지를 더 확인해 주세요`;

  return (
    <div className="flex flex-col gap-4">
      {/* 가장 먼저 확인해야 할 값은 금액과 방향이다(§12). */}
      <div className="rounded-[var(--r-control)] bg-[var(--accent-container)] px-4 py-3">
        {/* 옅은 청색 면 위에서는 ink-3 가 4.42:1 로 모자라 ink-2 를 쓴다(§6). */}
        <p className="text-[13px] text-[var(--ink-2)]">{summary}</p>
        <p className="mt-1">
          {errors.amount ? (
            <span className="text-[20px] font-semibold text-[var(--ink-3)]">금액 미정</span>
          ) : (
            <Money
              amount={amountValue}
              direction={direction === '' ? undefined : direction}
              className="text-[24px]"
            />
          )}
        </p>
      </div>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="금액" htmlFor="cand-amount" error={errors.amount ?? undefined}>
          <AmountInput
            id="cand-amount"
            value={amount}
            onChange={setAmount}
            aria-invalid={errors.amount !== null}
          />
        </Field>

        <Field label="날짜" htmlFor="cand-date" error={errors.date ?? undefined}>
          <input
            id="cand-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={errors.date !== null}
            className={inputClass}
          />
        </Field>

        <Field label="수입과 지출" htmlFor="cand-direction" error={errors.direction ?? undefined}>
          <Select
            id="cand-direction"
            value={direction}
            invalid={errors.direction !== null}
            placeholder="고르지 않음"
            options={[
              { value: '', label: '고르지 않음' },
              { value: 'expense', label: '지출' },
              { value: 'income', label: '수입' },
            ]}
            onChange={(v) => {
              const next = v as Direction | '';
              setDirection(next);
              if (next && categoryId) {
                const c = categories.find((x) => x.id === categoryId);
                if (c && c.direction !== next) setCategoryId('');
              }
            }}
          />
        </Field>

        <Field
          label="태그"
          htmlFor="cand-category"
          error={errors.category ?? undefined}
          hint={direction === '' ? '수입 또는 지출을 먼저 선택하세요.' : undefined}
        >
          <Select
            id="cand-category"
            value={categoryId}
            onChange={setCategoryId}
            disabled={direction === ''}
            invalid={errors.category !== null}
            placeholder="태그 없음"
            options={[{ value: '', label: '태그 없음' }, ...pool.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>
      </div>

      <Field label="내용" htmlFor="cand-note">
        <input id="cand-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>

      {/* 원문은 보조 정보로 접어 둔다(§12). */}
      <div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          className="text-[13px] text-[var(--primary)] underline"
        >
          {showRaw ? '적은 내용 접기' : '적은 내용 보기'}
        </button>
        {showRaw ? (
          <p className="mt-2 rounded-[var(--r-control)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink-2)]">
            {candidate.rawInput || '직접 입력'}
            {candidate.merchant ? ` · ${candidate.merchant}` : ''}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
        {/*
         * 여기서는 셋 다 낱말이다(ADR-023 의 예외).
         *
         * '나중에 확인'은 그림으로 약속된 동작이 아니라 아이콘이 될 수 없고,
         * 한 바닥에서 하나만 아이콘이면 형태가 무게를 대신 말한다. 이 바닥은
         * **여러 낱말 중에서 고르는 자리**이므로 낱말로 통일한다.
         * 셋이 대등하지 않다는 것은 형태가 아니라 색이 말한다 —
         * 붉은 글자는 되돌릴 수 없다는 뜻, 옅은 청색 면은 이 창의 주 동작이라는 뜻.
         */}
        <button
          type="button"
          className={btn.danger}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await discardCandidateAction(candidate.id);
              onDiscarded();
            })
          }
        >
          이 항목 버리기
        </button>
        <span className="flex-1" />
        {/*
         * 하단에 '닫기'를 다시 두지 않는다 — 상단 X 가 창 전체를 닫는다(재검수 v2 R08).
         * '나중에 확인'은 이 항목을 남긴다: 여럿이면 다음 항목으로, 하나뿐이면 창이 닫힌다.
         */}
        <button type="button" className={btn.ghost} disabled={pending} onClick={onLater}>
          나중에 확인
        </button>
        {/* 저장에 진한 채움 강조색을 쓰지 않는다 — 옅은 면으로 충분하다(ADR-023). */}
        <button
          type="button"
          className={btn.soft}
          disabled={pending || !ready}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              await patchCandidate(candidate.id, {
                date: date || null,
                amount: amountValue || null,
                direction: direction || null,
                categoryId: categoryId || null,
                note,
              });
              const r = await confirmCandidateAction(candidate.id);
              if (r.ok) {
                onSaved(`${krDate(date)}에 ${amountValue.toLocaleString('ko-KR')}원을 기록했어요.`);
              } else {
                setError(r.message ?? '저장하지 못했어요. 입력 내용은 남아 있어요.');
              }
            })
          }
        >
          {pending ? '저장 중' : '기록 저장'}
        </button>
      </div>
    </div>
  );
}
