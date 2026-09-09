'use client';

import { useRef, useState, useTransition } from 'react';
import type { Candidate, Category } from '@/lib/domain/types';
import { stageFromInput } from '../actions';
import { CandidateDialog } from './CandidateDialog';
import { Dialog } from './Dialog';
import { btn } from './atoms';

/**
 * 자동 입력 — 주 동선(FR-ENTRY-17).
 *
 * 한 줄 적고 ↵. 해석이 끝나면 확인 팝업이 바로 뜬다.
 * 이미지를 고르면 보내기 전에 안내가 뜬다(FR-ENTRY-18) — 보낸 뒤의 경고는 의미가 없다.
 */
export function PromptBar({
  categories,
  pending: pendingCandidates,
  imageNotice,
  usesNetwork,
  outbound,
}: {
  categories: Category[];
  pending: Candidate[];
  imageNotice: string;
  usesNetwork: boolean;
  outbound: { key: string; label: string; detail: string }[];
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [note, setNote] = useState<{ tone: 'warn' | 'error'; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Candidate[] | null>(null);
  const [outboundOpen, setOutboundOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const shown = dialog ?? (pendingCandidates.length > 0 ? null : null);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function submit() {
    if (busy) return;
    if (!text.trim() && !image) return;
    startTransition(async () => {
      const r = await stageFromInput(text, image?.dataUrl);
      if (!r.ok) {
        setNote({ tone: 'error', text: r.message ?? '실패' });
        return;
      }
      setText('');
      setImage(null);
      if (fileRef.current) fileRef.current.value = '';
      if (taRef.current) taRef.current.style.height = 'auto';
      setNote(
        r.degraded
          ? {
              tone: 'warn',
              text: `외부 해석 실패 · 기기 안에서 처리${r.failureDetail ? ` (${r.failureDetail})` : ''}`,
            }
          : null,
      );
      setDialog(r.candidates);
    });
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-5 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent px-5 pb-5 pt-6">
      <div className="mx-auto w-full max-w-5xl">
        {note ? (
          <p
            role="status"
            className={[
              'mb-2 rounded-full px-3.5 py-1.5 text-xs',
              note.tone === 'warn'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-[color-mix(in_oklch,var(--dir-expense)_9%,white)] text-[var(--dir-expense)]',
            ].join(' ')}
          >
            {note.text}
          </p>
        ) : null}

        {pendingCandidates.length > 0 && !dialog ? (
          <button
            type="button"
            onClick={() => setDialog(pendingCandidates)}
            className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3.5 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200"
          >
            확인 대기 {pendingCandidates.length}건
          </button>
        ) : null}

        {image ? (
          <div className="mb-2 flex items-start gap-2 rounded-[var(--r-md)] bg-amber-50 px-3.5 py-2.5">
            <span aria-hidden className="mt-0.5 text-sm">⚠︎</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-amber-900">{image.name}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">{imageNotice}</p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs text-amber-700 underline"
              onClick={() => {
                setImage(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              제거
            </button>
          </div>
        ) : null}

        {/* 입력 줄 — 하나의 둥근 판 안에 첨부·입력·보내기를 모은다 */}
        <div className="flex items-end gap-2 rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-2 pl-3 shadow-[var(--shadow-md)] transition-shadow focus-within:ring-4 focus-within:ring-[var(--primary-soft)]">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setImage({ dataUrl: String(reader.result), name: f.name });
              reader.readAsDataURL(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="영수증 첨부"
            title="영수증 첨부"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)] disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
              <path
                d="M18.5 11.5 12 18a4.5 4.5 0 1 1-6.36-6.36l7.07-7.07a3 3 0 0 1 4.24 4.24l-7.07 7.07a1.5 1.5 0 0 1-2.12-2.12l6.36-6.36"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <label className="sr-only" htmlFor="prompt">
            자연어 입력
          </label>
          <textarea
            id="prompt"
            ref={taRef}
            rows={1}
            value={text}
            disabled={busy}
            onChange={(e) => {
              setText(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="어제 점심 김밥천국 8000원"
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 outline-none placeholder:text-[var(--ink-3)]"
          />

          <button
            type="button"
            onClick={submit}
            disabled={busy || (!text.trim() && !image)}
            aria-label="입력"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-ink)] transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:opacity-30"
          >
            {busy ? (
              <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                <path
                  d="M12 19V5M12 5l-6 6M12 5l6 6"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 px-2">
          <p className="text-[11px] text-[var(--ink-3)]">
            ↵ 입력 · Shift+↵ 줄바꿈 · 확인 후 저장
          </p>
          <button
            type="button"
            onClick={() => setOutboundOpen(true)}
            className="text-[11px] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
          >
            {usesNetwork ? '전송 항목' : '기기 내 처리'}
          </button>
        </div>
      </div>

      <CandidateDialog
        open={dialog !== null}
        candidates={dialog ?? []}
        categories={categories}
        onClose={() => setDialog(null)}
      />

      {/* FR-ENTRY-16 — 나가는 항목을 항목 이름 수준으로 보여 준다 */}
      <Dialog
        open={outboundOpen}
        onClose={() => setOutboundOpen(false)}
        title="전송 항목"
        subtitle={usesNetwork ? '해석 요청 시에만 전송' : '기기 밖으로 나가는 항목 없음'}
      >
        {outbound.length === 0 ? (
          <p className="pb-4 text-sm text-[var(--ink-2)]">
            현재 기기 안에서만 해석. 밖으로 나가는 항목 없음.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)] pb-2">
            {outbound.map((f) => (
              <li key={f.key} className="py-2.5">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{f.detail}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="pb-4 text-[11px] text-[var(--ink-3)]">
          조회·요약·백업에서는 전송 없음.
        </p>
      </Dialog>
    </div>
  );
}
