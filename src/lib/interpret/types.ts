import type { Category, Direction } from '../domain/types';

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

export interface InterpretProvider {
  readonly name: string;
  /** 이 수단이 기기 밖으로 나가는가. false 면 외부 전송이 없다. */
  readonly usesNetwork: boolean;
  /** 이 수단이 밖으로 내보내는 항목. usesNetwork 가 false 면 빈 배열이다. */
  readonly outboundFields: OutboundField[];
  isAvailable(): boolean;
  interpret(input: InterpretInput): Promise<InterpretOutcome>;
}
