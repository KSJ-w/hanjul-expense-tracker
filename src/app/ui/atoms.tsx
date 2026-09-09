import type { Direction } from '@/lib/domain/types';

/**
 * 화면 조각. 색·모서리·그림자는 globals.css 의 토큰만 쓴다(ADR-006).
 *
 * **한 색은 한 뜻만 가진다(ADR-017).**
 *   적·녹 = 거래 방향. 금액에만 붙는다.
 *   파랑  = 지금 있는 곳과 주 동작(현재 탭·오늘·저장·포커스).
 *   cat-* = 계열 구분. 차트 안에서만 쓴다.
 *   그 밖의 모든 것은 중립이다 — 글자 3단, 면 3단, 선.
 * 뜻 없는 색을 더하지 않는다. 같은 뜻을 두 곳에서 색으로 되풀이하지도 않는다.
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
  /*
   * 음수 부호는 어디서나 같은 글자여야 한다. 방향이 없는 금액(잔액)에 그냥
   * toLocaleString 을 쓰면 ASCII 하이픈이 나와, 옆 칸의 지출('−', U+2212)과
   * 나란히 두면 길이와 높이가 어긋나 보인다.
   */
  const negative = direction === 'expense' || amount < 0;
  // 0 에는 부호를 붙이지 않는다 — '−0원' 은 뜻이 없는 기호만 남긴다.
  const sign = amount === 0 ? '' : direction === 'income' ? '+' : negative ? '−' : '';
  return (
    <span className={`tabular font-semibold ${color} ${className}`}>
      {sign}
      {Math.abs(amount).toLocaleString('ko-KR')}원
    </span>
  );
}

/**
 * 태그 이름표 — 중립이다.
 *
 * 전에는 태그마다 색을 달리 줬으나, 그 색은 "이 태그와 저 태그가 다르다"는 것 말고
 * 아무 뜻도 없으면서 금액의 적·녹과 같은 세기로 눈에 들어왔다. 계열을 색으로
 * 나누는 일은 차트가 맡는다 — 거기서는 색이 곧 계열이라는 뜻을 가진다(ADR-017).
 */
export function TagChip({ name }: { name: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[var(--r-sm)] bg-[var(--bg)] px-2 py-0.5 text-[11px] text-[var(--ink-2)] ring-1 ring-[var(--line)]">
      <span aria-hidden className="text-[var(--ink-3)]">#</span>
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
