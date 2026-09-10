'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * 고르는 칸 — ADR-025.
 *
 * 네이티브 `<select>` 를 쓰지 않는다. 닫혀 있을 때의 칸은 우리 곡선(`--r-control`)을
 * 따르지만 **펼쳤을 때 나오는 목록은 운영체제가 그린다** — 모서리가 각지고, 글자
 * 크기도 색도 우리 것이 아니다. 한 동작 안에서 모양이 두 번 바뀌는 셈이라,
 * 고르는 동안 화면이 우리 화면이 아니게 된다.
 *
 * 그래서 목록을 직접 그린다. 대신 네이티브가 공짜로 주던 것들을 **직접 갚아야** 한다:
 *   · 역할     `combobox` + `listbox` + `option`, `aria-expanded`·`aria-activedescendant`
 *   · 자판     ↑↓ 이동 · Enter/Space 선택 · Esc 닫기 · Home/End · 글자 눌러 찾기
 *   · 폼       `name` 을 주면 숨은 input 으로 값을 함께 보낸다(내역 화면은 GET 폼이다)
 *
 * 목록은 `position: fixed` 로 띄운다. 창(`<dialog>`)의 본문이 `overflow-y-auto` 라
 * absolute 로 두면 잘린다 — fixed 는 조상의 overflow 에 잘리지 않는다.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

/** 화면에 그리는 한 줄. 무리 이름은 고를 수 없는 줄이다. */
type Row = { kind: 'group'; label: string } | { kind: 'option'; option: SelectOption };

function toRows(options: SelectOption[] | undefined, groups: SelectGroup[] | undefined): Row[] {
  const rows: Row[] = [];
  for (const o of options ?? []) rows.push({ kind: 'option', option: o });
  for (const g of groups ?? []) {
    if (g.options.length === 0) continue;
    rows.push({ kind: 'group', label: g.label });
    for (const o of g.options) rows.push({ kind: 'option', option: o });
  }
  return rows;
}

export function Select({
  id,
  name,
  value,
  defaultValue,
  onChange,
  options,
  groups,
  disabled = false,
  invalid = false,
  className = '',
  placeholder = '고르기',
}: {
  id?: string;
  /** 주면 숨은 input 으로 값을 함께 보낸다. 폼 안에서 쓸 때 필요하다. */
  name?: string;
  /** 밖에서 값을 쥐는 경우. `onChange` 와 함께 쓴다. */
  value?: string;
  /** 밖에서 값을 쥐지 않는 경우의 처음 값. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const rows = toRows(options, groups);
  const all = rows.flatMap((r) => (r.kind === 'option' ? [r.option] : []));

  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = controlled ? value : inner;
  const selected = all.find((o) => o.value === current);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(
    null,
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  /** 목록의 자리. 아래가 좁으면 위로 편다. */
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const up = below < 180 && above > below;
    setBox({
      left: r.left,
      top: up ? r.top - gap : r.bottom + gap,
      width: r.width,
      maxHeight: Math.max(120, Math.min(280, up ? above : below)),
      up,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    // 스크롤은 캡처 단계로 받는다 — 창 본문처럼 안쪽에서 구르는 것도 잡아야 한다.
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // 활성 줄이 보이게 굴린다. 자판으로 옮길 때 화면 밖으로 나가면 안 된다.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' });
  });

  function commit(v: string) {
    if (!controlled) setInner(v);
    onChange?.(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openList() {
    const i = all.findIndex((o) => o.value === current);
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  }

  function move(delta: number) {
    if (all.length === 0) return;
    setActive((i) => Math.min(all.length - 1, Math.max(0, i + delta)));
  }

  /** 글자를 눌러 찾기 — 네이티브가 하던 일이다. 1초 안에 이어 누르면 이어 붙인다. */
  function seek(ch: string) {
    const now = Date.now();
    const text = now - typed.current.at < 1000 ? typed.current.text + ch : ch;
    typed.current = { text, at: now };
    const i = all.findIndex((o) => o.label.toLowerCase().startsWith(text.toLowerCase()));
    if (i >= 0) {
      setActive(i);
      if (!open) commit(all[i].value);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
        return;
      }
    } else {
      if (e.key === 'ArrowDown') return (e.preventDefault(), move(1));
      if (e.key === 'ArrowUp') return (e.preventDefault(), move(-1));
      if (e.key === 'Home') return (e.preventDefault(), setActive(0));
      if (e.key === 'End') return (e.preventDefault(), setActive(all.length - 1));
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (all[active]) commit(all[active].value);
        return;
      }
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      seek(e.key);
    }
  }

  let optionIndex = -1;

  return (
    <>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && all[active] ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={[
          // 입력칸과 **같은 아래 한 줄**을 쓴다(ADR-026). 줄은 그림자로 그린다.
          'field-underline flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-none border-0 bg-transparent px-0.5 text-left text-[15px] text-[var(--ink)] outline-none transition-shadow',
          invalid
            ? 'shadow-[inset_0_-2px_0_0_var(--danger-ink)]'
            : open
              ? 'shadow-[inset_0_-2px_0_0_var(--primary)]'
              : 'shadow-[inset_0_-1px_0_0_var(--field-line)] focus:shadow-[inset_0_-2px_0_0_var(--primary)]',
          disabled ? 'cursor-not-allowed text-[var(--ink-3)]' : '',
          className,
        ].join(' ')}
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-[var(--ink-3)]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-[var(--ink-2)]" fill="none" aria-hidden>
          <path
            d={open ? 'M5 12.5L10 7.5l5 5' : 'M5 7.5l5 5 5-5'}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && box ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={placeholder}
          style={{
            position: 'fixed',
            left: box.left,
            width: box.width,
            maxHeight: box.maxHeight,
            ...(box.up ? { bottom: window.innerHeight - box.top } : { top: box.top }),
          }}
          /* 목록도 칸과 같은 곡선을 쓴다. 안쪽 줄은 한 단계 작은 곡선으로 겹치지 않게 둔다. */
          className="z-50 overflow-y-auto rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-modal)]"
        >
          {rows.map((row) => {
            if (row.kind === 'group') {
              // 무리 이름은 고를 수 없는 줄이다. 고를 수 있는 줄과 크기·색으로만
              // 나누면 비슷해 보이므로, 앞선 줄이 있으면 실선으로도 끊는다.
              const first = rows[0] === row;
              return (
                <li
                  key={`g-${row.label}`}
                  role="presentation"
                  className={[
                    'px-2.5 pb-1 text-[12px] font-semibold text-[var(--ink-3)]',
                    first ? 'pt-1' : 'mt-1 border-t border-[var(--hairline)] pt-2',
                  ].join(' ')}
                >
                  {row.label}
                </li>
              );
            }
            optionIndex += 1;
            const i = optionIndex;
            const isSelected = row.option.value === current;
            const isActive = i === active;
            return (
              <li
                key={row.option.value || `empty-${i}`}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(row.option.value)}
                className={[
                  'flex cursor-pointer items-center justify-between gap-2 rounded-[var(--r-chip)] px-2.5 py-2 text-[15px]',
                  isActive ? 'bg-[var(--accent-container)] text-[var(--on-accent-container)]' : 'text-[var(--ink)]',
                ].join(' ')}
              >
                <span className="min-w-0 truncate">{row.option.label}</span>
                {isSelected ? (
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" aria-hidden>
                    <path
                      d="M4.5 10.5l3.5 3.5 7.5-8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
