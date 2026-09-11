import type { Category, Direction, RecordQuery } from '../domain/types';

/**
 * 해석 경계의 계약 — SDD §2 불변조건 1·2, ADR-010(ADR-003 을 Superseded 한 결정).
 *
 * 이 디렉터리(src/lib/interpret) 밖에서는 외부 통신을 하지 않는다.
 * 그것이 FR-ENTRY-15("해석 외의 목적으로 내보내지 않는다")를 구조로 지키는 방법이며,
 * test/boundary.test.ts 가 그 사실을 검사한다.
 */

/** FR-ENTRY-16 — 사용자에게 보여줄 '나가는 항목'. 항목 이름 수준으로 고정한다(RFP R-03). */
export interface OutboundField {
  key: string;
  label: string;
  detail: string;
}

export interface InterpretInput {
  text?: string;
  image?: { base64: string; mime: string };
  /** 상대적 날짜 해석의 기준(FR-ENTRY-02). */
  today: string;
  /** 자동 배정이 고를 수 있는 분류의 전부(FR-CAT-06 의 경계). */
  categories: Category[];
}

export interface InterpretedItem {
  date: string | null;
  amount: number | null;
  direction: Direction | null;
  categoryId: string | null;
  merchant: string | null;
  note: string;
}

export type InterpretFailure =
  | 'unavailable' // 그 수단을 지금 쓸 수 없다(키 없음 등)
  | 'no-response' // 요청했으나 응답이 없다
  | 'unparseable'; // 응답이 왔지만 기록으로 만들 수 없다

export interface InterpretOutcome {
  items: InterpretedItem[];
  /** 실제로 해석을 수행한 수단의 이름. */
  providerName: string;
  /** 외부 수단이 실패해 다른 수단으로 처리했는가(NFR-ENTRY-03 의 전달 근거). */
  degraded: boolean;
  failure?: InterpretFailure;
  /**
   * 실패했을 때 사람이 읽을 수 있는 사유.
   * 이것이 없으면 실패가 어디에도 남지 않아 "왜 안 되는가"에 답할 수 없다.
   * 키 같은 비밀은 절대 담지 않는다.
   */
  failureDetail?: string;
  /** NFR-ENTRY-01 의 측정값. 입력 접수부터 결과까지. */
  elapsedMs: number;
}

/* --------------------------------------------------------- 조회 요청의 해석 */

export interface QueryInput {
  /** 사용자가 한 줄로 적은 조회 요청. */
  text: string;
  /** 상대적 기간 표현('지난달')의 기준(FR-VIEW-13). */
  today: string;
  /** 조건으로 고를 수 있는 분류의 전부. 여기 없는 분류를 지어내지 않는다(FR-CAT-06 과 같은 경계). */
  categories: Category[];
}

/**
 * 알아들은 조건 하나 — FR-VIEW-13.
 *
 * 조건만 돌려주면 **알아듣지 못해 비어 있는 것**과 **원래 그 조건이 없는 것**이
 * 값에서 구별되지 않는다. 그러면 '못 찾음'과 '잘못 알아들음'이 화면에서 같은
 * 모습이 되어 사용자가 다시 적어 볼 수도 없다(US-08-01 수용 조건 5·6).
 */
export interface QueryTerm {
  key: 'period' | 'direction' | 'category' | 'amount' | 'text';
  /** 사람이 읽을 말. '지난달' · '지출만' · '30,000원 이상'. */
  label: string;
}

/**
 * 조회 하나 — FR-VIEW-13.
 *
 * 한 문장이 조회를 **여럿** 부를 수 있다: "이번달 지출과 수입 따로 보여줘"는
 * 한 번 묻고 두 번 조회하는 일이다. 합쳐서 한 목록으로 내놓으면 사용자가
 * 물은 '따로'를 화면이 되돌려 버린다.
 */
export interface QueryPart {
  /** 이 몫의 이름. 나뉘지 않았으면 빈 문자열이고, 그때 화면은 이름을 적지 않는다. */
  label: string;
  query: RecordQuery;
  terms: QueryTerm[];
}

export interface QueryOutcome {
  /** 비어 있으면 **아무 조건도 알아듣지 못했다**는 뜻이다. */
  parts: QueryPart[];
  providerName: string;
  degraded: boolean;
  failure?: InterpretFailure;
  failureDetail?: string;
  elapsedMs: number;
}

export interface InterpretProvider {
  readonly name: string;
  /** 이 수단이 기기 밖으로 나가는가. false 면 외부 전송이 없다. */
  readonly usesNetwork: boolean;
  /** 이 수단이 밖으로 내보내는 항목. usesNetwork 가 false 면 빈 배열이다. */
  readonly outboundFields: OutboundField[];
  isAvailable(): boolean;
  interpret(input: InterpretInput): Promise<InterpretOutcome>;
  /** 조회 문장을 조건으로 바꾼다(FR-VIEW-13). 기록을 만드는 것이 아니라 **찾는 조건**을 만든다. */
  interpretQuery(input: QueryInput): Promise<QueryOutcome>;
}
