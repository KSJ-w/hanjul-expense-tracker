'use client';

import { useRef, useState, useTransition } from 'react';
import type { Candidate, Category } from '@/lib/domain/types';
import { stageFromInput } from '../actions';
import { CandidateReview } from './CandidateReview';
import { StatusMessage } from './atoms';

/**
 * 하단 프롬프트 — ADR-021, 재검수 v2 §10.
 *
 * 이 제품의 기록 입력은 **화면 하단의 바 하나**다. 상단에 '한 줄로 기록하기'
 * 제목·설명·폼 카드를 만들지 않는다. 그렇게 바꿨더니 달력이 화면 밖으로 밀렸고
 * (1280px 에서 달력 시작 y≈564px, 390px 에서 y≈734px), 익숙한 프롬프트의
 * 실루엣이 사라졌다.
 *
 * 기본 상태에 보이는 것은 **첨부 / 적는 곳 / 전송** 뿐이다.
 * 설명은 없애는 것이 아니라 필요한 순간으로 옮긴다 — 첨부했을 때의 전송 안내,
 * 실패했을 때의 사유, 저장했을 때의 확인이 바로 위 한 줄에 조건부로 나타난다.
 *
 * 해석·후보·첨부·오류 보존 로직은 그대로 유지한다(§11).
 */
export function PromptDock({
  categories,
  pending: pendingCandidates,
  imageNotice,
}: {
  categories: Category[];
  pending: Candidate[];
  imageNotice: string;
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [status, setStatus] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const [review, setReview] = useState<Candidate[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    // 4~5줄까지 자라고 그 뒤에는 안에서 스크롤한다(§10).
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function submit() {
    if (busy) return;
    if (!text.trim() && !image) return;
    startTransition(async () => {
      const r = await stageFromInput(text, image?.dataUrl);
      if (!r.ok) {
        // 막다른 오류창을 만들지 않는다. 적은 내용과 첨부는 그대로 둔다(§11).
        setStatus({ tone: 'error', text: '해석하지 못했어요. 다시 보내거나 직접 입력해 주세요.' });
        return;
      }
      setText('');
      setImage(null);
      if (fileRef.current) fileRef.current.value = '';
      if (taRef.current) taRef.current.style.height = 'auto';
      setStatus(
        r.degraded
          ? {
              tone: 'warn',
              text: `외부 해석을 쓰지 못해 기기 안에서 처리했어요.${r.failureDetail ? ` (${r.failureDetail})` : ''}`,
            }
          : null,
      );
      setReview(r.candidates);
    });
  }

  const canSend = Boolean(text.trim() || image);

  return (
    <>
      <div
        /*
         * 좌우 여백과 최대 폭을 본문(layout.tsx)과 똑같이 맞춘다.
         * 어긋나면 프롬프트와 달력의 좌우 끝이 어긋나 보인다.
         * 바깥은 투명하고 클릭을 통과시킨다 — 문서 전체를 덮는 막을 만들지 않는다.
         */
        className="pointer-events-none fixed inset-x-0 bottom-[var(--dock-bottom)] z-20"
      >
        {/* layout.tsx 의 <main> 과 **같은 상자**를 쓴다 — 폭·여백이 같아야 끝이 맞는다. */}
        <div className="pointer-events-auto mx-auto flex w-full max-w-[1056px] flex-col gap-2 px-4 sm:px-6">
          {/* 조건부 알림 — 있을 때만 바 위에 한 줄로 나타난다(§11). */}
          {pendingCandidates.length > 0 && review === null ? (
            <button
              type="button"
              onClick={() => setReview(pendingCandidates)}
              className="w-fit rounded-[var(--r-pill)] bg-[var(--warn-bg)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--warn-ink)] shadow-[var(--shadow-dock)]"
            >
              저장 전 {pendingCandidates.length}건
            </button>
          ) : null}

          {image ? (
            <div className="flex items-start gap-3 rounded-[var(--r-control)] bg-[var(--warn-bg)] px-3.5 py-2.5 shadow-[var(--shadow-dock)]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--warn-ink)]">{image.name}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--warn-ink)]">{imageNotice}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImage(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="shrink-0 rounded-[var(--r-pill)] px-2 py-1 text-[13px] text-[var(--warn-ink)] underline"
              >
                제거
              </button>
            </div>
          ) : null}

          {status ? (
            <div className="shadow-[var(--shadow-dock)]">
              <StatusMessage tone={status.tone}>{status.text}</StatusMessage>
            </div>
          ) : null}

          {/* 바 — 첨부 / 적는 곳 / 전송. 그 밖의 것을 두지 않는다. */}
          <div /*
             * 포커스는 **바깥 테두리**로 알린다. 안쪽 입력칸에 링이 그려지면
             * 바 안에 또 하나의 상자가 생긴 것처럼 보인다.
             */
            className="prompt-bar flex items-end gap-2 rounded-[var(--r-prompt)] border border-[var(--field-line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-dock)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              id="dock-image"
              aria-label="영수증 이미지 고르기"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => setImage({ dataUrl: String(reader.result), name: f.name });
                reader.readAsDataURL(f);
              }}
            />

            {/*
             * 클립은 바로 파일 선택을 연다. 메뉴를 한 단계 끼우면 영수증을 붙이는
             * 데 두 번 눌러야 한다. 수동 입력은 날짜 상세의 '+' 가 맡는다
             * (FR-ENTRY-08 의 경로는 그쪽에 남아 있다).
             */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="영수증 첨부"
              title="영수증 첨부"
              className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                <path
                  d="M18.5 11.5 12 18a4.5 4.5 0 1 1-6.36-6.36l7.07-7.07a3 3 0 0 1 4.24 4.24l-7.07 7.07a1.5 1.5 0 0 1-2.12-2.12l6.36-6.36"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <label htmlFor="dock-text" className="sr-only">
              기록할 내용
            </label>
            <textarea
              id="dock-text"
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
              placeholder="어제 점심 8,500원"
              aria-describedby="dock-help"
              className="max-h-[120px] min-h-11 flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-[16px] leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus-visible:outline-none"
            />
            <p id="dock-help" className="sr-only">
              Enter 키로 내용을 확인하고, Shift와 Enter를 함께 누르면 줄을 바꿔요. 확인한 뒤에 저장돼요.
            </p>

            <button
              type="button"
              onClick={submit}
              disabled={busy || !canSend}
              aria-label="기록 내용 확인하기"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-ink)] transition-colors hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)] disabled:bg-[var(--line)] disabled:text-[var(--ink-3)]"
            >
              {busy ? (
                <svg viewBox="0 0 24 24" className="size-5 animate-spin" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                  <path
                    d="M12 19V5M12 5l-6 6M12 5l6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <CandidateReview
        open={review !== null}
        candidates={review ?? []}
        categories={categories}
        onClose={() => setReview(null)}
        onSaved={(msg) => {
          setStatus({ tone: 'info', text: msg });
          // 연속 기록이 가능하도록 입력바로 포커스를 돌려준다(§13).
          taRef.current?.focus();
        }}
      />
    </>
  );
}
