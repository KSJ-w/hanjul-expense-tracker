'use client';

import { useState, useTransition } from 'react';
import type { Category, Direction } from '@/lib/domain/types';
import { addCategoryAction, deleteCategoryAction, renameCategoryAction } from '../actions';
import { Dialog } from './Dialog';
import { btn, inputClass, TagChip } from './atoms';

/**
 * 태그 관리 — 원칙 4. 분류는 사용자의 것이다.
 * 화면 표기는 '태그', 문서의 용어는 '분류'다(SRS §1.4).
 * 기록이 있는 태그의 삭제는 확인을 거친다(FR-CAT-08). 삭제해도 지난 기록의 귀속은 남는다(NFR-CAT-01).
 */
export function TagManager({
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

  const list = categories.filter((c) => c.direction === direction);
  const indexOf = (id: string) => categories.findIndex((c) => c.id === id);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              startTransition(async () => {
                const r = await addCategoryAction(newName, direction);
                setMsg(r.ok ? null : (r.message ?? null));
                if (r.ok) setNewName('');
              });
            }
          }}
          placeholder={direction === 'expense' ? '반려동물' : '이자'}
          className={`${inputClass} max-w-56`}
        />
        <button
          type="button"
          className={btn.primary}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await addCategoryAction(newName, direction);
              setMsg(r.ok ? null : (r.message ?? null));
              if (r.ok) setNewName('');
            })
          }
        >
          추가
        </button>
      </div>

      {msg ? <p className="mb-2 text-xs text-amber-700">{msg}</p> : null}

      <ul className="divide-y divide-[var(--line)]">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2.5">
            {editingId === c.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`${inputClass} max-w-56`}
                />
                <button
                  type="button"
                  className={btn.soft}
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
                <button type="button" className={btn.ghost} onClick={() => setEditingId(null)}>
                  취소
                </button>
              </>
            ) : (
              <>
                <TagChip name={c.name} />
                <span className="flex-1" />
                {c.seeded ? (
                  <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] text-[var(--ink-3)]">
                    기본
                  </span>
                ) : null}
                <button
                  type="button"
                  className={btn.ghost}
                  onClick={() => {
                    setEditingId(c.id);
                    setEditName(c.name);
                  }}
                >
                  이름
                </button>
                <button
                  type="button"
                  className={btn.danger}
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
                >
                  삭제
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ink-3)]">태그 없음</p>
      ) : null}

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="태그 삭제"
        subtitle={confirming ? `${confirming.name} · 기록 ${confirming.count}건` : undefined}
        footer={
          <>
            <button type="button" className={btn.ghost} onClick={() => setConfirming(null)}>
              취소
            </button>
            <button
              type="button"
              className={btn.primary}
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
              삭제
            </button>
          </>
        }
      >
        <p className="pb-4 text-sm leading-relaxed text-[var(--ink-2)]">
          이 태그에 기록이 남아 있음. 삭제해도 지난 기록이 어느 태그였는지는 그대로 유지되고,
          앞으로의 선택지에서만 빠짐.
        </p>
      </Dialog>
    </div>
  );
}
