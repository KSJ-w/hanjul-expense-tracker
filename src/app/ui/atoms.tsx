import type { Direction } from '@/lib/domain/types';

/**
 * 화면 조각. 색·모서리·그림자는 globals.css 의 토큰만 쓴다(ADR-006).
 *
 * 글은 명사형으로 끝낸다 — 화면의 이름표는 문장이 아니라 이름이다.
 * 다만 "찾지 못함"과 "없었음"은 끝까지 구분한다(FR-VIEW-07).
 */

export function Money({
  amount,
  direction,
  className = '',
}: {
  amount: number;
  direction?: Direction;
  className?: string;
}) {
  const color =
    direction === 'income'
      ? 'text-[var(--dir-income)]'
      : direction === 'expense'
        ? 'text-[var(--dir-expense)]'
        : 'text-[var(--ink)]';
  const sign = direction === 'income' ? '+' : direction === 'expense' ? '−' : '';
  return (
    <span className={`tabular font-semibold ${color} ${className}`}>
      {sign}
      {amount.toLocaleString('ko-KR')}원
    </span>
  );
}

export function DirectionChip({ direction }: { direction: Direction }) {
  const income = direction === 'income';
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        income
          ? 'bg-[color-mix(in_oklch,var(--dir-income)_13%,white)] text-[var(--dir-income)]'
          : 'bg-[color-mix(in_oklch,var(--dir-expense)_11%,white)] text-[var(--dir-expense)]',
      ].join(' ')}
    >
      {income ? '수입' : '지출'}
    </span>
  );
}

export function TagChip({ name, index = 0 }: { name: string; index?: number }) {
  const color = `var(--cat-${(index % 10) + 1})`;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `color-mix(in oklch, ${color} 12%, white)`, color }}
    >
      <span aria-hidden>#</span>
      {name}
    </span>
  );
}

export function Panel({
  children,
  className = '',
  as: As = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <As
      className={`rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] ${className}`}
    >
      {children}
    </As>
  );
}

export function PanelTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">{children}</h2>
      {hint ? <span className="text-xs text-[var(--ink-3)]">{hint}</span> : null}
    </div>
  );
}

/**
 * 빈 결과 — FR-VIEW-07.
 *
 * 문구는 **기록**이 없다고만 말한다. 거래가 없었다고 말하지 않는다.
 * 그 구분은 낱말이 지킨다 — 설명 문장을 덧붙여 지키던 것을 걷어냈다.
 * FR-VIEW-07 이 금지하는 것은 부재를 단정하는 표현이지 설명의 부재가 아니다.
 * 이 컴포넌트를 "거래 없음"의 표시로 쓰지 않는다.
 */
export function EmptyNote({ title = '기록 없음' }: { title?: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-8 text-center">
      <p className="text-sm font-medium text-[var(--ink-2)]">{title}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-[var(--ink-2)]">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ink-3)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-soft)] disabled:bg-[var(--bg)]';

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-ink)] shadow-[var(--shadow-sm)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
  soft: 'inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--bg)] px-3.5 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--line)] disabled:opacity-45',
  ghost:
    'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-[var(--ink-3)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--ink)]',
  danger:
    'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-[var(--dir-expense)] transition-colors hover:bg-[color-mix(in_oklch,var(--dir-expense)_9%,white)]',
};
