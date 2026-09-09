'use client';

import { useEffect, useRef } from 'react';

/**
 * 팝업. 네이티브 <dialog> 를 쓴다 — 포커스 가둠·Esc 닫기·backdrop 을
 * 브라우저가 이미 제대로 해 준다. 직접 만들면 그것부터 다시 만들어야 한다.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  /** 푸터의 배치. 버튼 줄이 기본이지만 입력 영역을 통째로 받는 곳도 있다. */
  footerClassName = 'flex items-center justify-end gap-2',
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  footerClassName?: string;
  width?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // backdrop 클릭으로 닫기. dialog 자신이 이벤트 대상일 때만 backdrop 이다.
        if (e.target === ref.current) onClose();
      }}
      className={[
        // 네이티브 dialog 는 margin:auto 로 가운데에 온다. 리셋이 margin 을 0 으로
        // 만들어 두면 좌상단에 붙는다 — 그래서 m-auto 를 명시한다.
        'm-auto w-[calc(100vw-2rem)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-lg)]',
        width === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-[var(--ink-3)]">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-mr-2 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)]"
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-6 pb-2">{children}</div>

      {footer ? (
        <div className={`border-t border-[var(--line)] px-6 py-4 ${footerClassName}`}>{footer}</div>
      ) : (
        <div className="pb-4" />
      )}
    </dialog>
  );
}
