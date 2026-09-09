'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Category, Direction } from '@/lib/domain/types';
import { parseISODate } from '@/lib/domain/date';
import { createRecordAction } from '../actions';
import { Dialog } from './Dialog';
import { Field, inputClass, StatusMessage } from './atoms';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function krDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}

/**
 * 이 날짜에 기록 — FR-ENTRY-08.
 *
 * 해석이 실패해도 길이 끊기지 않는 경로다. 날짜를 눌러 들어온 창이므로
 * **제목도 날짜도 다시 적지 않는다.** 창은 흰 면에서 바로 시작하고,
 * 맨 위의 색 바가 지출인지 수입인지를 고르는 곳이라는 것을 스스로 말한다.
 *
 * 색은 여기서 방향의 뜻을 가진다 — 지출은 붉게, 수입은 초록으로. 고른 쪽만
 * 색을 띠므로 무엇을 골랐는지도 색이 함께 알린다(ADR-017).
 */
export function NewRecordDialog({
  date,
  categories,
  onClose,
}: {
  date: string;
  categories: Category[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  const pool = categories.filter((c) => c.direction === direction);
  const amountValue = Number(amount.replace(/[^\d]/g, ''));
  const amountError =
    amount.trim() === '' ? null : amountValue <= 0 ? '숫자로 0보다 큰 금액을 적어 주세요.' : null;

  function save() {
    if (amount.trim() === '' || amountValue <= 0) {
      setError('금액을 적어 주세요.');
      return;
    }
    startTransition(async () => {
      const r = await createRecordAction({
        date,
        amount: amountValue,
        direction,
        categoryId: categoryId || null,
        note,
      });
      if (!r.ok) {
        setError(r.message ?? '저장하지 못했어요. 입력 내용은 남아 있어요.');
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      /* 화면에는 보이지 않지만 창의 이름으로는 남는다. */
      title={`${krDate(date)}에 기록`}
      hideHeader
      width="md"
      /* 저장은 창 바닥 전체를 쓴다. 닫기는 오른쪽 위 X 하나로 충분하다. */
      footer={
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-12 w-full rounded-[var(--r-pill)] bg-[var(--primary)] text-[16px] font-semibold text-[var(--primary-ink)] transition-colors hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)] disabled:opacity-50"
        >
          {pending ? '저장 중' : '저장하기'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 맨 위의 색 바 — 무엇을 적는 창인지 이것이 먼저 말한다. */}
        <div
          role="group"
          aria-label="수입인지 지출인지"
          className="mt-1 flex gap-2 pr-12"
        >
          {(['expense', 'income'] as Direction[]).map((dir) => {
            const on = direction === dir;
            const tint = dir === 'expense' ? 'var(--dir-expense)' : 'var(--dir-income)';
            return (
              <button
                key={dir}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setDirection(dir);
                  setCategoryId('');
                }}
                className="h-12 flex-1 rounded-[var(--r-pill)] border text-[16px] font-semibold transition-colors"
                style={
                  on
                    ? {
                        background: `color-mix(in oklch, ${tint} 13%, var(--surface))`,
                        borderColor: tint,
                        color: tint,
                      }
                    : {
                        background: 'var(--surface)',
                        borderColor: 'var(--line)',
                        color: 'var(--ink-3)',
                      }
                }
              >
                {dir === 'expense' ? '지출' : '수입'}
              </button>
            );
          })}
        </div>

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <Field label="금액" htmlFor="new-amount" error={amountError ?? undefined}>
          <input
            id="new-amount"
            ref={amountRef}
            inputMode="numeric"
            value={amount}
            placeholder="8500"
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
            }}
            aria-invalid={amountError !== null}
            className={`${inputClass} tabular`}
          />
        </Field>

        <Field label="분류" htmlFor="new-category">
          <select
            id="new-category"
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

        <Field label="내용" htmlFor="new-note">
          <input
            id="new-note"
            value={note}
            placeholder="점심"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
            }}
            className={inputClass}
          />
        </Field>
      </div>
    </Dialog>
  );
}
