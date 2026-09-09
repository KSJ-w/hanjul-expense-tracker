'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** 탭 셋. 이름은 명사로만 둔다. */
const LINKS = [
  { href: '/', label: '달력' },
  { href: '/dashboard', label: '대시보드' },
  { href: '/tags', label: '태그' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Link href="/" className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-[var(--r-sm)] bg-[var(--primary)] text-sm font-bold text-[var(--primary-ink)]"
        >
          ₩
        </span>
        <span className="text-[17px] font-semibold tracking-tight">한줄 가계부</span>
      </Link>

      <nav aria-label="탭" className="flex items-center gap-1 rounded-full bg-[var(--surface)] p-1 shadow-[var(--shadow-sm)] ring-1 ring-[var(--line)]">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-[var(--primary)] font-medium text-[var(--primary-ink)]'
                  : 'text-[var(--ink-2)] hover:bg-[var(--bg)]',
              ].join(' ')}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
