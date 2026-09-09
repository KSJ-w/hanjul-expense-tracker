/**
 * 도메인 타입 — 이름은 SRS §1.4 용어집을 그대로 따른다.
 * 용어가 바뀌면 SRS 를 먼저 고치고 여기를 따라 바꾼다.
 */

/** 거래 방향. SRS §1.4 — 값은 수입·지출·미확정 셋 중 하나다. */
export type Direction = 'income' | 'expense';

/** 기록 후보에서 아직 값이 정해지지 않은 항목의 이름. */
export type UnresolvedField = 'date' | 'amount' | 'direction' | 'category';

/** 분류. 고유 식별자와 이름을 가지며 이름은 변경 가능하다(FR-CAT-02). */
export interface Category {
  id: string;
  name: string;
  /** 이 분류가 쓰이는 거래 방향(FR-CAT-05). */
  direction: Direction;
  sortOrder: number;
  /** 처음 제공된 분류인지 여부(FR-CAT-04). 사용자는 이것도 고치고 지울 수 있다. */
  seeded: boolean;
  createdAt: string;
}

/**
 * 확정 기록 — 사용자의 확인 동작을 거쳐 저장된 자료.
 * 조회·요약·합계의 유일한 대상이다(SRS §4 불변조건 7).
 */
export interface RecordEntry {
  id: string;
  /** YYYY-MM-DD (기기 지역시 기준) */
  date: string;
  /** 원 단위 정수. 통화가 하나라는 가정 위에 있다(SRS §9). */
  amount: number;
  direction: Direction;
  categoryId: string | null;
  /** 사용자가 적은 내용 */
  note: string;
  /** 거래 대상(상호명 등) — FR-CAT-07 의 판정 기준 */
  merchant: string | null;
  /** 근거 이미지 참조. 없을 수 있다(FR-ENTRY-13). */
  imageId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 삭제 표시. null 이 아니면 조회·요약 대상에서 빠진다(FR-ENTRY-10, SDD 불변조건 6). */
  deletedAt: string | null;
}

/** 기록 후보를 만든 경로. */
export type CandidateSource = 'text' | 'image' | 'recurring' | 'manual';

/**
 * 기록 후보 — 사용자의 확인을 기다리는 미확정 자료.
 * 확정 기록과 저장 경로가 분리되며 집계의 대상이 아니다(SDD 불변조건 3·4).
 */
export interface Candidate {
  id: string;
  source: CandidateSource;
  /** 사용자가 적은 원문. 해석이 실패해도 이것은 사라지지 않는다(FR-ENTRY-07). */
  rawInput: string;
  date: string | null;
  amount: number | null;
  direction: Direction | null;
  categoryId: string | null;
  merchant: string | null;
  note: string;
  imageId: string | null;
  /** 값이 정해지지 않은 항목. 비어 있는 것과 구분된다(SRS §1.4 미확정 항목). */
  unresolved: UnresolvedField[];
  /** 어떤 해석 수단이 만들었는가. 실패 시 null. */
  providerName: string | null;
  createdAt: string;
}

/** 근거 이미지. 확정 기록당 하나 이하로 연결된다(SRS §7). */
export interface SourceImage {
  id: string;
  /** ADR-007 — 파일로 보관하고 DB 에는 경로만 둔다. */
  relPath: string;
  mime: string;
  bytes: number;
  createdAt: string;
}

/** 예산. 예산의 부재와 금액 0 은 서로 다른 상태다(SRS §7). */
export interface Budget {
  id: string;
  categoryId: string;
  /** YYYY-MM */
  periodKey: string;
  amount: number;
}

/** 반복 항목. 그 자체는 확정 기록이 아니다(SRS §1.4). */
export interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  direction: Direction;
  categoryId: string | null;
  note: string;
  merchant: string | null;
  /** 매달 며칠. 그 달에 없는 날이면 그 달의 마지막 날로 당긴다. */
  anchorDay: number;
  active: boolean;
  createdAt: string;
}

/**
 * 분류 변경 이력 — FR-CAT-07 의 판정 근거.
 * 같은 거래 대상에 대해 가장 나중의 것이 우선한다(SRS §7).
 */
export interface MerchantCategoryRule {
  merchant: string;
  categoryId: string;
  updatedAt: string;
}

/** 조회 조건(FR-VIEW-06). 지정된 조건을 모두 만족하는 기록만 반환한다. */
export interface RecordQuery {
  from?: string;
  to?: string;
  categoryId?: string;
  direction?: Direction;
  amountMin?: number;
  amountMax?: number;
  text?: string;
  limit?: number;
  offset?: number;
}

/**
 * 조회 결과 — 0 건과 "거래 없음" 을 구분하기 위해 결과와 의미를 함께 돌려준다.
 * SRS §4 불변조건 2 / FR-VIEW-07.
 */
export interface QueryOutcome<T> {
  items: T[];
  /** 조건에 맞는 기록을 찾지 못함. "그 기간에 거래가 없었음" 이 아니다. */
  noMatch: boolean;
}
