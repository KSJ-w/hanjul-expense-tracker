'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Category, Direction, RecordEntry } from '@/lib/domain/types';
import { parseISODate } from '@/lib/domain/date';
import { createRecordAction, deleteRecordAction, updateRecordAction } from '../actions';
import { Dialog } from './Dialog';
import { btn, Field, inputClass, StatusMessage } from './atoms';
import { AmountInput, groupDigits } from './AmountInput';
import { Select } from './Select';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function krDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}

/**
 * 기록 창 — 새로 적을 때와 고칠 때가 **같은 창**이다(ADR-024, FR-ENTRY-08·09).
 *
 * 전에는 줄을 누르면 '거래 상세'라는 읽기 화면이 먼저 열리고, 거기서 '수정'을
 * 한 번 더 눌러야 폼이 나왔다. 그런데 사용자가 자기가 적은 줄을 누르는 까닭은
 * 대개 **고치려는 것**이다. 읽기 화면은 목록 줄이 이미 보여 준 것(분류·내용·금액)을
 * 한 번 더 보여 줄 뿐이어서, 누름 한 번을 값 없이 더 받았다.
 *
 * 그래서 줄을 누르면 바로 이 창이 열린다. 그리고 이 창은 **처음 적을 때 보던
 * 것과 같은 모양**이다 — 금액, 분류, 내용이 같은 차례로 온다. 같은 일을 하는 곳이
 * 두 가지 모습을 가지면 그 둘을 각각 익혀야 한다.
 *
 * 날짜 칸은 두지 않는다. 이 창은 날짜를 눌러 들어온 자리이고, 창의 이름이 이미
 * 그 날짜다. 날짜를 옮기는 일은 이 창이 맡는 일이 아니다.
 *
 * **방향은 새로 적을 때만 고른다.** 고치러 들어온 창에는 방향 바를 두지 않는다 —
 * 지출인지 수입인지는 그 기록을 적을 때 이미 정한 것이고, 고칠 때마다 다시 묻는
 * 것은 묻지 않아도 될 것을 묻는 일이다. 대신 금액 이름표가 '지출 금액'·'수입 금액'
 * 으로 그 사실을 말한다 — 빼되 감추지는 않는다.
 *
 * 색은 새로 적는 창의 방향 바에서만 방향의 뜻을 가진다 — 지출은 붉게, 수입은
 * 초록으로. 고른 쪽만 색을 띠므로 무엇을 골랐는지도 색이 함께 알린다(ADR-017).
 */
export function RecordDialog({
  date,
  record,
  categories,
  onClose,
  onDeleted,
}: {
  /** 새로 적을 날짜. `record` 가 있으면 그 기록의 날짜를 쓴다. */
  date: string;
  /** 있으면 고치는 창, 없으면 새로 적는 창. */
  record?: RecordEntry;
  categories: Category[];
  onClose: () => void;
  /** 지웠을 때. 되돌리기는 부모(날짜 상세)가 목록 밖에 둔다(ADR-019). */
  onDeleted?: (r: RecordEntry) => void;
}) {
  const editing = record !== undefined;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(record ? groupDigits(String(record.amount)) : '');
  const [direction, setDirection] = useState<Direction>(record?.direction ?? 'expense');
  const [categoryId, setCategoryId] = useState(record?.categoryId ?? '');
  const [note, setNote] = useState(record?.note ?? '');
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
      const r = record
        ? await updateRecordAction(record.id, {
            amount: amountValue,
            direction,
            categoryId: categoryId || null,
            note,
          })
        : await createRecordAction({
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
      title={`${krDate(record?.date ?? date)} ${editing ? '기록 고치기' : '기록'}`}
      hideHeader
      hideClose
      width="md"
      /*
       * 바닥의 동작 — ADR-027. 널리 쓰이는 대화상자 지침을 그대로 따른다.
       *
       *  · **동작은 바닥에 모으고 오른쪽으로 붙이며, 확인하는 동작이 맨 오른쪽**이다
       *    (Material Design 3 / PatternFly). 취소가 그 왼쪽에 온다.
       *  · **되돌릴 수 없는 동작은 주 동작에서 떼어 놓는다**(GitLab Pajamas,
       *    PatternFly). 그래서 삭제는 반대쪽 끝이다 — 습관대로 오른쪽을 눌렀을 때
       *    닿지 않는 자리다.
       *  · **낱말로 적는다.** 아이콘만 두면 이름이 없어 뜻이 추측이 된다
       *    (NN/g, 'Cancel vs Close'). 좁은 목록 줄과 달리 바닥은 낱말을 넣을
       *    자리가 있다 — 아이콘은 줄에서만 쓴다(ADR-023 개정).
       *  · 창에 **고치는 칸이 있으면 X 하나로 끝내지 않는다**(NN/g). '취소'가
       *    글자로 있어야 무엇을 버리는지가 분명하다. 그래서 이 창은 X 를 빼고
       *    취소를 둔다 — 같은 뜻의 닫는 길을 둘 두지 않는다.
       *  · 삭제에 확인 창을 겹치지 않는 이유는 **되돌리기가 있기 때문**이다
       *    (날짜 상세의 되돌리기 줄, ADR-019). 확인과 되돌리기 중 하나면 된다.
       */
      footer={
        <div className="flex w-full items-center gap-2">
          {editing && record ? (
            <button
              type="button"
              className={btn.danger}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteRecordAction(record.id);
                  if (r.ok) onDeleted?.(record);
                  else setError('삭제하지 못했어요.');
                })
              }
            >
              삭제
            </button>
          ) : null}
          <span className="flex-1" />
          <button type="button" className={btn.ghost} disabled={pending} onClick={onClose}>
            취소
          </button>
          <button type="button" className={btn.soft} disabled={pending} onClick={save}>
            {pending ? '저장 중' : '저장'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/*
         * 맨 위의 색 바 — 무엇을 적는 창인지 이것이 먼저 말한다.
         * 고치는 창에는 두지 않는다. 방향은 이미 정해진 것이다(ADR-024).
         */}
        {editing ? null : (
        <div role="group" aria-label="수입인지 지출인지" className="flex gap-2">
          {(['expense', 'income'] as Direction[]).map((dir) => {
            const on = direction === dir;
            const tint = dir === 'expense' ? 'var(--dir-expense)' : 'var(--dir-income)';
            return (
              <button
                key={dir}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  // 방향이 그대로면 분류를 지우지 않는다 — 고치러 들어온 창이다.
                  if (dir === direction) return;
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
        )}

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        {/*
         * 고치는 창에서는 이름표가 방향을 말한다 — 방향 바를 뺐다고 해서
         * 이것이 지출인지 수입인지 알 수 없게 두지는 않는다.
         */}
        <Field
          label={editing ? (direction === 'income' ? '수입 금액' : '지출 금액') : '금액'}
          htmlFor="record-amount"
          error={amountError ?? undefined}
        >
          {/*
           * 빈 칸에 예시를 적어 두지 않는다. 이름표가 '지출 금액'이라고 이미
           * 말했고, 회색 예시 숫자는 값이 들어 있는 것처럼 보인다.
           */}
          <AmountInput
            id="record-amount"
            ref={amountRef}
            value={amount}
            onChange={setAmount}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
            }}
            aria-invalid={amountError !== null}
          />
        </Field>

        <Field label="태그" htmlFor="record-category">
          <Select
            id="record-category"
            value={categoryId}
            onChange={setCategoryId}
            placeholder="태그 없음"
            options={[{ value: '', label: '태그 없음' }, ...pool.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>

        <Field label="내용" htmlFor="record-note">
          <input
            id="record-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
            }}
            className={inputClass}
          />
        </Field>

        {/*
         * 영수증은 이 창에서 바꾸지 않는다. 다만 붙어 있다는 사실과 여는 길은
         * 남긴다 — 고치는 화면이 원래 기록의 일부를 감추면 안 된다.
         */}
        {record?.imageId ? (
          <a
            href={`/api/image/${record.imageId}`}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-[13px] text-[var(--primary)] underline"
          >
            붙여 둔 영수증 열기
          </a>
        ) : null}
      </div>
    </Dialog>
  );
}
