'use client';

import { useId, useState, useTransition } from 'react';
import type { Category, Direction } from '@/lib/domain/types';
import { addCategoryAction, deleteCategoryAction, renameCategoryAction } from '../actions';
import { Dialog } from './Dialog';
import { btn, Field, IconButton, inputClass, StatusMessage } from './atoms';

/**
 * 분류 관리 — 원칙 4. 분류는 사용자의 것이다(ADR-020, §16).
 *
 * 이름을 작은 칩에 넣지 않고 **본문 크기**로 보여 준다. 읽는 일이 먼저다.
 * '삭제'라고 부르던 것은 실제로 보관이다 — 선택지에서만 빠지고 지난 기록의
 * 귀속은 그대로 남는다(NFR-CAT-01). 그래서 이름을 '보관'으로 바꿨다.
 */
export function CategoryManager({
  categories,
  direction,
}: {
  categories: Category[];
  direction: Direction;
}) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirming, setConfirming] = useState<{ id: string; name: string; count: number } | null>(null);
  const inputId = useId();

  const list = categories.filter((c) => c.direction === direction);
  const heading = direction === 'expense' ? '지출 분류' : '수입 분류';

  function add() {
    startTransition(async () => {
      const r = await addCategoryAction(newName, direction);
      setMsg(r.ok ? null : (r.message ?? null));
      if (r.ok) setNewName('');
    });
  }

  return (
    <section aria-label={heading}>
      <h3 className="mb-3 text-[15px] font-semibold">
        {heading} <span className="font-normal text-[var(--ink-3)]">{list.length}개</span>
      </h3>

      <div className="mb-4 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="새 분류 이름" htmlFor={inputId}>
            <input
              id={inputId}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={direction === 'expense' ? '반려동물' : '이자'}
              className={inputClass}
            />
          </Field>
        </div>
        <button type="button" className={btn.primary} disabled={pending || !newName.trim()} onClick={add}>
          추가
        </button>
      </div>

      {msg ? (
        <div className="mb-3">
          <StatusMessage tone="warn">{msg}</StatusMessage>
        </div>
      ) : null}

      {list.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-[var(--ink-2)]">아직 만든 분류가 없어요.</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((c) => (
            <li key={c.id} className="border-b border-[var(--line)] py-2 last:border-0">
              {editingId === c.id ? (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label="분류 이름" htmlFor={`rename-${c.id}`}>
                      <input
                        id={`rename-${c.id}`}
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <button type="button" className={btn.ghost} onClick={() => setEditingId(null)}>
                    취소
                  </button>
                  <button
                    type="button"
                    className={btn.primary}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await renameCategoryAction(c.id, editName);
                        setMsg(r.ok ? null : (r.message ?? null));
                        if (r.ok) setEditingId(null);
                      })
                    }
                  >
                    저장
                  </button>
                </div>
              ) : (
                /*
                 * 줄의 동작은 아이콘이다(ADR-023). 줄마다 '이름 변경'·'보관'이
                 * 글자로 늘어서면 정작 읽어야 할 분류 이름보다 버튼이 넓어진다.
                 * 이름은 aria-label 과 풍선말에 남는다.
                 */
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-[15px]">{c.name}</span>
                  <IconButton
                    icon="pencil"
                    label={`${c.name} 이름 변경`}
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                  />
                  <IconButton
                    icon="archive"
                    label={`${c.name} 보관`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await deleteCategoryAction(c.id, false);
                        if (!r.ok && r.needsConfirm) {
                          setConfirming({ id: c.id, name: c.name, count: r.recordCount ?? 0 });
                        } else if (!r.ok) {
                          setMsg(r.message ?? null);
                        }
                      })
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[13px] text-[var(--ink-3)]">
        보관하면 지난 기록은 유지되고, 새 기록의 선택지에서만 숨겨져요. 보관한 분류를 다시 꺼내는
        화면은 아직 없어요.
      </p>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="이 분류를 보관할까요?"
        subtitle={confirming ? `${confirming.name} · 기록 ${confirming.count}건` : undefined}
        footer={
          <>
            <span className="flex-1" />
            <button type="button" className={btn.ghost} onClick={() => setConfirming(null)}>
              취소
            </button>
            {/* 확인하는 동작은 어느 창에서나 맨 오른쪽에 옅은 면으로 온다(ADR-027). */}
            <button
              type="button"
              className={btn.soft}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  if (!confirming) return;
                  await deleteCategoryAction(confirming.id, true);
                  setConfirming(null);
                  setMsg(null);
                })
              }
            >
              보관
            </button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">
          지난 기록이 어느 분류였는지는 그대로 유지돼요. 앞으로 새로 기록할 때의 선택지에서만
          빠져요.
        </p>
      </Dialog>
    </section>
  );
}
