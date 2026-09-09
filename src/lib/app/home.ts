import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db';
import { todayISO } from '../domain/date';
import { hasAnyRecord, listByDate, totalsForPeriod, type Totals } from '../repo/records';
import { listCandidates } from '../repo/candidates';
import { emitDueRecurring } from '../repo/recurring';
import { currentOutboundFields, interpretationStatus } from '../interpret';
import { IMAGE_ATTACH_NOTICE, IMAGE_ATTACH_NOTICE_LOCAL } from '../interpret/notices';
import type { Candidate, RecordEntry } from '../domain/types';
import type { OutboundField } from '../interpret/types';

/**
 * 첫 진입 지점의 자료 — FR-ENTRY-17.
 *
 * `inputAvailable` 이 항상 참인 것이 요구의 내용이다: 기록을 남기는 수단은
 * 추가 이동 없이 늘 제시된다. `hasRecords` 가 거짓이어도 그것은 사용 불가가 아니다.
 */
export interface HomeState {
  today: string;
  /** 기록 입력 수단이 이 지점에서 바로 제시되는가. 언제나 참이어야 한다. */
  inputAvailable: boolean;
  hasRecords: boolean;
  /** 기록 없음을 사용 불가로 표시해서는 안 된다(FR-ENTRY-17, FR-VIEW-07). */
  emptyStateIsUsable: boolean;
  candidates: Candidate[];
  todayRecords: RecordEntry[];
  monthTotals: Totals;
  outbound: OutboundField[];
  imageNotice: string;
  provider: { providerName: string; usesNetwork: boolean; externalAvailable: boolean };
}

export function buildHomeState(db: DatabaseSync = getDb(), today: string = todayISO()): HomeState {
  // 반복 항목의 날짜가 지났으면 후보로 낸다. 확정하지 않는다(FR-ENTRY-12 + FR-ENTRY-05).
  emitDueRecurring(today, db);

  const status = interpretationStatus();
  return {
    today,
    inputAvailable: true,
    hasRecords: hasAnyRecord(db),
    emptyStateIsUsable: true,
    candidates: listCandidates(db),
    todayRecords: listByDate(today, db).items,
    monthTotals: totalsForPeriod('month', today, db),
    outbound: currentOutboundFields(),
    imageNotice: status.usesNetwork ? IMAGE_ATTACH_NOTICE : IMAGE_ATTACH_NOTICE_LOCAL,
    provider: status,
  };
}
