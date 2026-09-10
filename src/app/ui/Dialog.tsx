'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * 대화상자 — ADR-020, 검수 §13.
 *
 * 네이티브 <dialog> 를 쓴다. 포커스 가둠·Esc·backdrop 을 브라우저가 해 주지만,
 * **이름·포커스 복귀·높이는 직접 챙겨야 한다.** 네이티브라는 이유로 생략하지 않는다.
 *
 *  - 제목을 aria-labelledby 로 연결한다(전에는 이름이 없었다 — 검수 V12).
 *  - 창 **전체**에 max-height 를 준다. 본문만 70vh 로 묶고 머리글·바닥글을 더하면
 *    작은 화면에서 저장 버튼이 밖으로 밀린다(검수 V20).
 *  - 스크롤은 본문 한 곳에만 둔다.
 *  - 닫으면 열기 전에 포커스가 있던 곳으로 돌려준다.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  /**
   * 머리글을 감춘다. 창 스스로 무엇을 하는 곳인지 말하는 화면에서 쓴다.
   * 제목은 화면에서만 사라지고 **접근 가능한 이름으로는 남는다** — 대화상자의
   * 이름이 없어지면 안 된다(검수 V12).
   */
  hideHeader = false,
  /**
   * 오른쪽 위 닫기(X)를 두지 않는다.
   *
   * 고치는 칸이 있는 창은 X 하나로 끝내지 않는다 — X 는 "그냥 닫기"로도
   * "지금까지 적은 것을 버리기"로도 읽힌다(NN/g, 'Cancel vs Close'). 그런 창은
   * 바닥에 '취소'를 글자로 두고, 같은 뜻의 닫는 길을 둘 두지 않는다.
   * Esc 와 backdrop 은 그대로 동작한다.
   */
  hideClose = false,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideHeader?: boolean;
  hideClose?: boolean;
  /** md 560px = 단일 확인 · lg 640px = 복잡 편집(§13) */
  width?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  /*
   * 우리가 닫는 중인가.
   *
   * `el.close()` 는 네이티브 `close` 이벤트를 일으키고, 그것이 `onClose` 로
   * 흘러가면 **부모가 이미 내린 결정을 다시 뒤집는다.** 실제로 그 때문에
   * 날짜 상세의 '+' 가 아무 반응도 하지 않았다: '+' 가 상세를 닫자 close 가
   * 부모의 onClose 를 불러 상세 전체가 언마운트되고, 그 안에 있던 '기록 창을
   * 연다'는 상태까지 함께 사라졌다.
   * onClose 는 **사용자가 닫았을 때**(Esc·backdrop·닫기 버튼)만 부른다.
   *
   * 표시를 `close()` 직후에 지우면 안 된다 — `close` 이벤트는 **비동기로** 오므로
   * 그때는 이미 표시가 지워져 있다. 이벤트를 받는 쪽에서 지운다.
   */
  const closingByUs = useRef(false);
  const titleId = useId();

  /*
   * 바닥과 본문 사이의 실선은 **본문이 실제로 구를 때만** 긋는다.
   *
   * 선은 "여기서 잘렸고 아래로 이어진다"는 뜻이다. 이어질 것이 없는데 그으면
   * 나눌 것을 나누지 않고 자리만 차지한다 — 단추 하나를 위해 창을 가로지르는
   * 선이 그 단추보다 커진다. 창마다 손으로 정하지 않고 여기서 재서 정한다.
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyScrolls, setBodyScrolls] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !open) return;
    const check = () => setBodyScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    // 내용이 자라도 상자 자체는 격자가 크기를 잡아 안 바뀐다. 안쪽도 함께 본다.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    /*
     * 창 크기 변화는 따로도 받는다. ResizeObserver 는 그림이 그려지는 박자에
     * 실려 오므로, 화면이 그려지지 않는 동안에는 한 번도 오지 않는다.
     * 창 높이가 줄어 본문이 구르기 시작하는 경우가 정확히 그 경우다.
     */
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [open, children]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      closingByUs.current = false;
      opener.current = document.activeElement;
      el.showModal();
      /*
       * `showModal()` 은 창 안의 **첫 번째 누를 수 있는 것**에 포커스를 준다.
       * 그것이 대개 오른쪽 위 닫기(X)라, 기록을 저장하고 창이 다시 열리면
       * 닫기 단추에 포커스 링이 그려진 채로 나타났다 — 방금 한 일과 아무 상관
       * 없는 곳이 강조된다(실제로 겪음). 창 자체로 포커스를 옮겨 그것을 없앤다.
       * 포커스는 여전히 창 안에 있으므로 Tab 은 그대로 동작한다.
       * 안에서 따로 포커스를 잡는 창(기록 창의 금액 칸)은 부모의 effect 가
       * 이 뒤에 돌아 제 자리를 가져간다 — 자식 effect 가 먼저 돈다.
       */
      el.focus();
    }
    if (!open && el.open) {
      closingByUs.current = true;
      el.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        if (closingByUs.current) {
          closingByUs.current = false;
          return;
        }
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // backdrop 클릭으로 닫기. dialog 자신이 대상일 때만 backdrop 이다.
        if (e.target === ref.current) onClose();
      }}
      tabIndex={-1}
      className={[
        // 창 자체가 포커스를 받을 때 링을 그리지 않는 것은 globals.css 가 맡는다 —
        // 그 규칙이 레이어 밖이라 여기에 유틸리티를 붙여도 이기지 못한다.
        // 네이티브 dialog 는 margin:auto 로 가운데에 온다. 리셋이 margin 을 0 으로
        // 만들어 두면 좌상단에 붙는다 — 그래서 m-auto 를 명시한다.
        'm-auto w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] rounded-[var(--r-dialog)] border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[var(--shadow-modal)]',
        /*
         * 머리글 / 본문 / 바닥글 세 행. 본문만 늘어나고 줄어든다.
         * `hidden open:grid` 인 이유 — 닫힌 <dialog> 를 숨기는 것은 브라우저 기본
         * 스타일의 display:none 인데, 여기에 그냥 grid 를 주면 그것을 덮어써서
         * 닫혀 있어야 할 창이 화면에 남는다(실제로 겪음).
         */
        'hidden open:grid grid-rows-[auto_minmax(0,1fr)_auto]',
        width === 'lg' ? 'sm:max-w-[640px]' : 'sm:max-w-[560px]',
      ].join(' ')}
    >
      {hideHeader ? (
        <div className="relative">
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
          {hideClose ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[18px] font-semibold">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-[var(--ink-2)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-[var(--r-control)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      <div ref={bodyRef} className="overflow-y-auto px-5 py-4">
        {children}
      </div>

      {footer ? (
        <div
          className={`flex flex-wrap items-center gap-2 px-5 py-4 ${bodyScrolls ? 'border-t border-[var(--line)]' : ''}`}
        >
          {footer}
        </div>
      ) : (
        <div />
      )}
    </dialog>
  );
}
