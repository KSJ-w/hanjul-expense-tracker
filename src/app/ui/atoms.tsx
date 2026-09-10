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

/**
 * 입력칸 — **아래 한 줄**이다(ADR-026).
 *
 * 네 변을 두른 상자를 쓰지 않는다. 칸마다 상자를 두르면 창 안에 상자가 여럿
 * 생기고, 정작 읽어야 할 것은 상자가 아니라 그 안의 값이다. 줄 하나면 "여기가
 * 적는 자리"라는 것을 말하는 데 충분하다.
 *
 * 누르면 그 줄이 굵고 진해진다 — 지금 어디에 적고 있는지는 **줄이 말한다**.
 *
 * 줄은 테두리가 아니라 `inset` 그림자로 그린다. 두 가지 이유다.
 *   · 테두리를 1px→2px 로 바꾸면 그만큼 칸의 높이가 달라져 아래 것들이 밀린다
 *     (ADR-019 — 길이가 변하는 것은 자리를 미리 잡는다). 그림자는 자리를 쓰지 않는다.
 *   · `border-[...]` 로 색을 바꾸려 했을 때 기본 색 유틸리티를 이기지 못했다
 *     (실제로 겪음 — 규칙은 생성되는데 적용되지 않았다). 그림자는 한 속성뿐이라
 *     기본과 focus 가 같은 자리를 다투고, 변형이 확실히 이긴다.
 *
 * 높이 44px 는 그대로다. 줄만 남았다고 해서 누를 자리가 좁아지면 안 된다.
 */
export const inputClass =
  'field-underline w-full min-w-0 h-11 rounded-none border-0 bg-transparent px-0.5 text-[15px] text-[var(--ink)] outline-none shadow-[inset_0_-1px_0_0_var(--field-line)] transition-shadow placeholder:text-[var(--ink-3)] aria-[invalid=true]:shadow-[inset_0_-2px_0_0_var(--danger-ink)] focus:shadow-[inset_0_-2px_0_0_var(--primary)] disabled:text-[var(--ink-3)] disabled:shadow-[inset_0_-1px_0_0_var(--line)]';

/** 여러 줄 입력. 높이는 내용에 따라 자란다. 경계는 입력칸과 같이 아래 한 줄이다. */
export const textareaClass =
  'field-underline w-full min-w-0 resize-none rounded-none border-0 bg-transparent px-0.5 py-2.5 text-[16px] leading-6 text-[var(--ink)] outline-none shadow-[inset_0_-1px_0_0_var(--field-line)] transition-shadow placeholder:text-[var(--ink-3)] focus:shadow-[inset_0_-2px_0_0_var(--primary)]';

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

/* ------------------------------------------------------------------ 아이콘 */

/**
 * 동작 아이콘 — ADR-023.
 *
 * 삭제·수정처럼 **모두가 같은 그림으로 알고 있는 동작**은 낱말 대신 아이콘으로
 * 둔다. 목록의 줄마다 '이름 변경'·'목록에서 지우기' 같은 글자 버튼이 늘어서면
 * 정작 읽어야 할 이름과 금액이 밀린다(ADR-018 이 말한 것과 같은 문제다).
 *
 * 다만 아이콘은 스스로 이름이 없다. 그래서 아이콘 버튼은 반드시
 * `IconButton` 을 거치게 하고, 거기서 `aria-label` 과 `title` 을 강제한다 —
 * 화면 낭독기에는 이름이 남고, 마우스에는 풍선말이 뜬다.
 */
const ICON_PATHS = {
  /** 삭제 — 휴지통. */
  trash: 'M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10.5 11v6M13.5 11v6',
  /** 수정 — 연필. */
  pencil: 'M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5V20zM14.5 6.5l3.5 3.5',
  /** 보관 — 뚜껑 덮은 상자. 지우는 것이 아니라 넣어 두는 것이다. */
  archive: 'M3.5 5.5h17v3.5h-17zM5 9v9a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V9M10 13h4',
  /** 멈춤. */
  pause: 'M9.5 6v12M14.5 6v12',
  /** 다시 켜기. */
  play: 'M8.5 5.5v13l10.5-6.5z',
  /** 저장·확인 — 체크. */
  check: 'M4.5 12.5l5 5 10-11',
  /** 더하기. */
  plus: 'M12 5v14M5 12h14',
  /** 닫기. */
  close: 'M6 6l12 12M18 6L6 18',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden focusable="false">
      <path
        d={ICON_PATHS[name]}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 아이콘 버튼 — 이름 없는 버튼을 만들 수 없게 `label` 을 필수로 둔다.
 * tone 은 셋뿐이다: 중립 · 되돌릴 수 없는 것(danger) · 주 동작(accent).
 */
export function IconButton({
  icon,
  label,
  tone = 'neutral',
  className = '',
  ...rest
}: {
  icon: IconName;
  /** 화면 낭독기에 읽히는 이름이자 마우스 풍선말. 빈 문자열을 넣지 않는다. */
  label: string;
  tone?: 'neutral' | 'danger' | 'accent';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'>) {
  const skin =
    tone === 'danger'
      ? 'text-[var(--danger-ink)] hover:bg-[var(--warn-bg)]'
      : tone === 'accent'
        ? 'bg-[var(--accent-container)] text-[var(--on-accent-container)] hover:brightness-97'
        : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${skin} ${className}`}
    >
      <Icon name={icon} />
    </button>
  );
}
