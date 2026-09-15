'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 주 내비게이션 — 네 목적지(ADR-020·ADR-021).
 *
 * **모든 폭에서 상단에 둔다.** 전에는 모바일에서 하단에 고정했는데,
 * 하단은 이 제품에서 기록 입력 프롬프트의 자리다(재검수 v2 §9).
 * 둘을 함께 고정하면 도구 영역이 두 줄이 되고, 키보드까지 올라오면 본문이 사라진다.
 *
 * 활성 상태는 색만이 아니라 굵기·둥근 선택 면·aria-current 로 함께 알린다.
 */
export const DESTINATIONS = [
  { href: '/', label: '달력' },
  { href: '/dashboard', label: '통계' },
  { href: '/search', label: '내역' },
  { href: '/settings', label: '태그' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-[1056px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <Link href="/" className="flex w-fit shrink-0 items-center gap-2">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-[var(--r-control)] bg-[var(--primary)] text-[var(--primary-ink)]"
          >
            <CalendarIcon />
          </span>
          <span className="text-[20px] font-bold tracking-tight sm:text-[21px]">한줄 가계부</span>
        </Link>

        {/* 둥근 선택 면으로 지금 있는 곳을 알린다. 밑줄만 쓰지 않는다(§3.3). */}
        <nav aria-label="주 메뉴" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {DESTINATIONS.map((d) => {
            const active = isActive(pathname, d.href);
            return (
              <Link
                key={d.href}
                href={d.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-10 items-center whitespace-nowrap rounded-[var(--r-pill)] px-4 text-[15px] transition-colors',
                  active
                    ? 'bg-[var(--accent-container)] font-semibold text-[var(--on-accent-container)]'
                    : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
                ].join(' ')}
              >
                {d.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ 아이콘 */

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 3.4v3.2M16 3.4v3.2M3.5 10h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}


