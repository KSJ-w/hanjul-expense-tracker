'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 탭 — ADR-013.
 *
 * 하나로 이어 붙인 알약 대신 밑줄 방식을 쓴다. 이어 붙이면 다섯 칸이 한 덩어리로
 * 읽혀 지금 어디에 있는지가 색으로만 구분되고, 폭을 균등 분배하느라 글자 사이가
 * 제품 폭에 따라 들쭉날쭉해진다. 밑줄은 각 항목을 독립된 목적지로 보여 준다.
 */
const LINKS = [
  { href: '/', label: '달력' },
  { href: '/dashboard', label: '대시보드' },
  { href: '/tags', label: '태그' },
  { href: '/search', label: '검색' },
  { href: '/etc', label: '기타' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-[var(--line)]">
      <Link href="/" className="flex w-fit items-center gap-2.5 pb-3">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-[12px] bg-[var(--primary)] text-[var(--primary-ink)] shadow-[var(--shadow-sm)]"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <rect x="3.5" y="5" width="17" height="15" rx="4.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 3.4v3.2M16 3.4v3.2M3.5 10h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="12" cy="15" r="1.9" fill="currentColor" />
          </svg>
        </span>
        <span className="text-[17px] font-semibold tracking-tight">한줄 가계부</span>
      </Link>

      <nav aria-label="탭" className="-mb-px flex items-center gap-0.5 overflow-x-auto">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'relative whitespace-nowrap rounded-t-[10px] px-4 py-2.5 text-sm transition-colors',
                active
                  ? 'font-medium text-[var(--primary)]'
                  : 'text-[var(--ink-3)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
              ].join(' ')}
            >
              {l.label}
              {active ? (
                /* bottom-0 이다. -bottom-px 로 두면 밑줄이 컨테이너를 1px 넘겨
                   overflow-x-auto 가 세로 스크롤바까지 만든다(실제로 겪음) */
                <span
                  aria-hidden
                  className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--primary)]"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
