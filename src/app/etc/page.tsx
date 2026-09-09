import { dataDir, getDb } from '@/lib/db';
import { currentOutboundFields, interpretationStatus } from '@/lib/interpret';
import { getCategoryName, listCategories } from '@/lib/repo/categories';
import { listMerchantRules } from '@/lib/repo/merchantRules';
import { listRecurring } from '@/lib/repo/recurring';
import { Panel, PanelTitle, TagChip } from '../ui/atoms';
import { RecurringManager } from '../ui/RecurringManager';
import { BackupPanel } from '../ui/BackupPanel';

export const dynamic = 'force-dynamic';

/**
 * 기타 — 태그 탭에서 덜어낸 것들을 한곳에 모아 둔 자리(ADR-013).
 *
 * 성격이 서로 다른 셋(자동 배정 기억·반복·백업)이 한 탭에 있다는 것을 알고 둔다.
 * 나중에 각자의 자리를 정하기 전까지의 임시 묶음이다.
 */
export default function EtcPage() {
  const db = getDb();
  const categories = listCategories(undefined, db);
  const recurring = listRecurring(db);
  const rules = listMerchantRules(db).map((r) => ({
    ...r,
    categoryName: getCategoryName(r.categoryId, db),
    index: categories.findIndex((c) => c.id === r.categoryId),
  }));

  // FR-ENTRY-16 — 나가는 항목의 조회 지점. 입력줄에 있던 것을 이리로 옮겼다.
  const outbound = currentOutboundFields();
  const { usesNetwork } = interpretationStatus();

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelTitle hint={usesNetwork ? '해석 요청 시에만' : '나가는 항목 없음'}>전송 항목</PanelTitle>
        {outbound.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">기기 안에서만 해석</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {outbound.map((f) => (
              <li key={f.key} className="py-2.5">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{f.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelTitle hint={`${rules.length}개`}>자동 배정 기억</PanelTitle>
        {rules.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">기억된 항목 없음</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {rules.map((r) => (
              <li key={r.merchant} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex-1 truncate">{r.merchant}</span>
                <span className="text-[var(--ink-3)]">→</span>
                {r.categoryName ? (
                  <TagChip name={r.categoryName} />
                ) : (
                  <span className="text-xs text-[var(--ink-3)]">삭제된 태그</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelTitle hint={`${recurring.length}개`}>반복</PanelTitle>
        <RecurringManager items={recurring} categories={categories} />
      </Panel>

      <Panel>
        <PanelTitle>백업</PanelTitle>
        <BackupPanel dataDir={dataDir()} />
      </Panel>
    </div>
  );
}
