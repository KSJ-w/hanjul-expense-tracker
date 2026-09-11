import type {
  InterpretInput,
  InterpretOutcome,
  InterpretProvider,
  OutboundField,
  QueryInput,
  QueryOutcome,
} from './types';
import { heuristicProvider } from './heuristic';
import { geminiProvider, geminiModelName } from './gemini';

export type {
  InterpretInput,
  InterpretOutcome,
  InterpretedItem,
  OutboundField,
  QueryInput,
  QueryOutcome,
  QueryPart,
  QueryTerm,
} from './types';

/**
 * 해석 경계 — 밖으로 나가는 일은 전부 이 아래에서만 일어난다(SDD §2 불변조건 1·2).
 *
 * 수단을 갈아끼우는 지점도 여기다. 다른 수단을 쓰려면 이 배열만 바꾼다.
 * 그것이 NFR-ENTRY-04("교체 시 영향 범위가 해석 경계 안에 머문다")를 지키는 방법이다.
 */
const PROVIDERS: InterpretProvider[] = [geminiProvider, heuristicProvider];

/** 지금 실제로 쓰이게 될 수단. */
export function activeProvider(): InterpretProvider {
  return PROVIDERS.find((p) => p.isAvailable()) ?? heuristicProvider;
}

/** 마지막 수단(항상 기기 안에서 도는 것). 외부가 죽어도 이것은 산다. */
export function fallbackProvider(): InterpretProvider {
  return heuristicProvider;
}

/**
 * FR-ENTRY-16 — 지금 설정에서 밖으로 나가는 항목.
 * 외부 수단을 쓰지 않는 상태면 빈 배열이다("나가는 것이 없음"을 그대로 보여준다).
 */
export function currentOutboundFields(): OutboundField[] {
  const p = activeProvider();
  return p.usesNetwork ? p.outboundFields : [];
}

export function interpretationStatus(): {
  providerName: string;
  usesNetwork: boolean;
  externalAvailable: boolean;
  /** 외부 수단을 쓸 때 실제로 부르는 모델. 어떤 모델인지 모르면 실패를 진단할 수 없다. */
  model: string | null;
} {
  const p = activeProvider();
  return {
    providerName: p.name,
    usesNetwork: p.usesNetwork,
    externalAvailable: geminiProvider.isAvailable(),
    model: p === geminiProvider ? geminiModelName() : null,
  };
}

/**
 * 입력을 해석해 기록 후보의 재료를 만든다.
 *
 * 외부 수단이 실패하면 기기 안 수단으로 이어받되, 그 사실을 degraded 로 알린다.
 * 조용히 대체하면 NFR-ENTRY-03("응답 실패 사실을 사용자에게 전달")이 깨지고,
 * 대체하지 않으면 원칙 3("자동이 실패해도 길이 끊기지 않는다")이 깨진다.
 */
export async function interpret(input: InterpretInput): Promise<InterpretOutcome> {
  const primary = activeProvider();
  const started = Date.now();
  const outcome = await primary.interpret(input);

  const failed = outcome.failure !== undefined && outcome.items.length === 0;
  if (!failed || primary === heuristicProvider) {
    return { ...outcome, elapsedMs: Date.now() - started };
  }

  const backup = await heuristicProvider.interpret(input);
  return {
    ...backup,
    degraded: true,
    failure: outcome.failure,
    failureDetail: outcome.failureDetail,
    providerName: `${heuristicProvider.name} (${primary.name} 실패)`,
    elapsedMs: Date.now() - started,
  };
}

/**
 * 조회 문장을 조건으로 바꾼다 — FR-VIEW-13.
 *
 * 기록 해석과 같은 규칙으로 대체한다: 외부가 실패하면 기기 안 규칙이 이어받되
 * **그 사실을 degraded 로 알린다.** 조용히 대체하면 사용자는 왜 덜 알아들었는지
 * 알 수 없고, 대체하지 않으면 키가 없는 동안 내역을 찾을 길이 통째로 끊긴다.
 */
export async function interpretQuery(input: QueryInput): Promise<QueryOutcome> {
  const primary = activeProvider();
  const started = Date.now();
  const outcome = await primary.interpretQuery(input);

  const failed = outcome.failure !== undefined && outcome.parts.length === 0;
  if (!failed || primary === heuristicProvider) {
    return { ...outcome, elapsedMs: Date.now() - started };
  }

  const backup = await heuristicProvider.interpretQuery(input);
  return {
    ...backup,
    degraded: true,
    failure: backup.parts.length === 0 ? outcome.failure : undefined,
    failureDetail: outcome.failureDetail,
    providerName: `${heuristicProvider.name} (${primary.name} 실패)`,
    elapsedMs: Date.now() - started,
  };
}
