import type { Direction } from '@/lib/domain/types';

/**
 * 화면 조각 — ADR-020·ADR-021. 색·모서리·그림자는 globals.css 의 토큰만 쓴다.
 *
 * 색은 뜻을 가진 것에만 붙이되, **색만으로 뜻을 지지 않는다**(ADR-017 개정).
 * 지출·수입은 색과 함께 부호(−/+)로 표시하고, 필요하면 방향 낱말을 곁들인다.
 * 색을 보지 못해도 부호와 이름표로 같은 뜻이 전달되어야 한다.
 *
 * 글은 이름표는 명사, 동작은 동사, 설명은 짧은 문장으로 쓴다(§3).
 */

/* ------------------------------------------------------------------ 금액 */

/**
 * 금액 표시 계약 — §11.
 *
 * - 말줄임하지 않는다. 숫자와 '원'은 한 줄로 붙어 다닌다.
 * - 음수 기호는 U+2212 '−' 하나로 통일한다. ASCII 하이픈을 쓰지 않는다.
 * - 0 에는 부호를 붙이지 않는다. '−0원' 은 뜻 없는 기호만 남긴다.
 * - 방향은 부호로 전달한다. `signed=false` 는 라벨이 이미 방향을 말할 때만.
 */
export function formatWon(amount: number): string {
  return `${Math.abs(amount).toLocaleString('ko-KR')}원`;
}

export function Money({
  amount,
  direction,
  signed = true,
  className = '',
}: {
  amount: number;
  direction?: Direction;
  /** 라벨이 이미 '지출'·'수입'을 말하는 자리에서는 부호를 뺀다(§11). */
  signed?: boolean;
  className?: string;
}) {
  /*
   * 부호는 **방향이 먼저**다(v2 검수 R02).
   *
   * 전에는 `amount > 0` 을 `direction === 'expense'` 보다 먼저 봐서, 이 제품의
   * 금액이 늘 양수 크기인 탓에 지출에 '+' 가 붙었다. 같은 기록이 달력에서는
   * −8,500, 내역에서는 +8,500 으로 보였다.
   * 방향이 없을 때만 숫자의 부호로 판단한다.
   */
  const sign =
    !signed || amount === 0
      ? ''
      : direction === 'expense'
        ? '−'
        : direction === 'income'
          ? '+'
          : amount < 0
            ? '−'
            : '+';
  const color =
    direction === 'expense'
      ? 'text-[var(--dir-expense)]'
      : direction === 'income'
        ? 'text-[var(--dir-income)]'
        : 'text-[var(--ink)]';

  return (
    <span className={`tabular whitespace-nowrap font-semibold ${color} ${className}`}>
      {sign}
      {formatWon(amount)}
    </span>
  );
}

/* ------------------------------------------------------------------ 이름표 */

/** 분류 이름표. 옅은 청색 면 위의 글자는 ink-2 를 쓴다 — ink-3 는 그 위에서 4.42:1 로 모자란다. */
export function CategoryChip({ name }: { name: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-[var(--r-chip)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[13px] text-[var(--ink-2)]">
      {name}
    </span>
  );
}

/* ------------------------------------------------------------------ 표면 */

/**
 * 표면 — 세 종류뿐이다(§7).
 *   plain   기본 표면. 그림자 없음
 *   raised  떠 있는 표면. 약한 그림자 1단
 *   inset   보조 표면. 요약·비강조 구역
 */
export function Panel({
  children,
  className = '',
  tone = 'plain',
  as: As = 'section',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'plain' | 'raised' | 'inset' | 'accent';
  as?: 'section' | 'div' | 'article' | 'aside';
} & React.HTMLAttributes<HTMLElement>) {
  const skin =
    tone === 'raised'
      ? 'bg-[var(--surface)] border border-[var(--line)] shadow-[var(--shadow-dock)]'
      : tone === 'inset'
        ? 'bg-[var(--surface-2)]'
        : tone === 'accent'
          ? 'bg-[var(--accent-container)]'
          : 'bg-[var(--surface)] border border-[var(--line)]';
  return (
    <As {...rest} className={`rounded-[var(--r-panel)] ${skin} ${className}`}>
      {children}
    </As>
  );
}

export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-[18px] font-semibold text-[var(--ink)]">{children}</h2>
      {hint ? <span className="text-[13px] text-[var(--ink-3)]">{hint}</span> : null}
      {action}
    </div>
  );
}

/**
 * 빈 상태 — §17 문구표.
 * '기록 없음'이 아니라 '저장한 기록이 없어요'다. 거래가 없었다고 단정하지 않는다.
 */
export function EmptyNote({
  title = '저장한 기록이 없어요',
  action,
}: {
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="text-[15px] text-[var(--ink-2)]">{title}</p>
      {action}
    </div>
  );
}

/** 상태 알림 — 저장 성공·실패·해석 실패를 같은 모양으로 전달한다(§12). */
export function StatusMessage({
  tone,
  children,
}: {
  tone: 'info' | 'warn' | 'error';
  children: React.ReactNode;
}) {
  const skin =
    tone === 'warn'
      ? 'bg-[var(--warn-bg)] text-[var(--warn-ink)]'
      : tone === 'error'
        ? 'bg-[var(--warn-bg)] text-[var(--danger-ink)]'
        : 'bg-[var(--accent-container)] text-[var(--on-accent-container)]';
  return (
    <p role="status" className={`rounded-[var(--r-control)] px-3 py-2 text-[13px] ${skin}`}>
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ 입력 */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--ink-2)]">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-[var(--danger-ink)]">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-[var(--ink-3)]">{hint}</p>
      ) : null}
    </div>
  );
}

/** 입력칸 — 높이 44px, 경계는 인접 면과 3:1 이상. 모달 안 입력은 12~16px 곡선(§7). */
export const inputClass =
  'w-full min-w-0 h-11 rounded-[var(--r-control)] border border-[var(--field-line)] bg-[var(--surface)] px-3.5 text-[15px] text-[var(--ink)] outline-none transition-[border-color] placeholder:text-[var(--ink-3)] focus:border-[var(--primary)] disabled:bg-[var(--surface-2)] disabled:text-[var(--ink-3)]';

/** 여러 줄 입력. 높이는 내용에 따라 자란다. */
export const textareaClass =
  'w-full min-w-0 resize-none rounded-[var(--r-control)] border border-[var(--field-line)] bg-[var(--surface)] px-3.5 py-2.5 text-[16px] leading-6 text-[var(--ink)] outline-none transition-[border-color] placeholder:text-[var(--ink-3)] focus:border-[var(--primary)]';

const btnBase =
  'inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--r-pill)] px-5 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const btn = {
  /** 한 과업 구역에서 가장 중요한 동작 하나에만. pill 이다(§7). */
  primary: `${btnBase} bg-[var(--primary)] text-[var(--primary-ink)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)]`,
  /** 보조 — 옅은 면(tonal). 테두리 버튼을 늘어놓지 않는다. */
  soft: `${btnBase} bg-[var(--accent-container)] text-[var(--on-accent-container)] hover:brightness-98`,
  outline: `${btnBase} border border-[var(--field-line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]`,
  ghost: `${btnBase} px-4 text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]`,
  /** 되돌릴 수 없는 동작. 붉은 채움의 큰 버튼으로 강조하지 않는다(§13). */
  danger: `${btnBase} px-4 text-[var(--danger-ink)] hover:bg-[var(--warn-bg)]`,
};

/** 아이콘 전용 버튼 — 원형, 터치 영역 44px, 아이콘 자체는 20px(§7). */
export const iconBtn =
  'grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:opacity-40';
