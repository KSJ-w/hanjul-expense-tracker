import { dataDir, getDb } from '@/lib/db';
import { getCategoryName, listCategories } from '@/lib/repo/categories';
import { listMerchantRules } from '@/lib/repo/merchantRules';
import { listRecurring } from '@/lib/repo/recurring';
import { Panel, PanelTitle, TagChip } from '../ui/atoms';
import { TagManager } from '../ui/TagManager';
import { RecurringManager } from '../ui/RecurringManager';
import { BackupPanel } from '../ui/BackupPanel';

export const dynamic = 'force-dynamic';

export default function TagsPage() {
  const db = getDb();
  const categories = listCategories(undefined, db);
  const recurring = listRecurring(db);
  const rules = listMerchantRules(db).map((r) => ({
    ...r,
    categoryName: getCategoryName(r.categoryId, db),
    index: categories.findIndex((c) => c.id === r.categoryId),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle hint={`${categories.filter((c) => c.direction === 'expense').length}개`}>
            지출 태그
          </PanelTitle>
          <TagManager categories={categories} direction="expense" />
        </Panel>
        <Panel>
          <PanelTitle hint={`${categories.filter((c) => c.direction === 'income').length}개`}>
            수입 태그
          </PanelTitle>
          <TagManager categories={categories} direction="income" />
        </Panel>
      </div>

      <Panel>
        <PanelTitle hint="확인 단계에서 고친 태그">자동 배정 기억</PanelTitle>
        {rules.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">
            기억된 항목 없음. 확인 팝업에서 태그를 고치면 같은 거래처에 다음부터 반영됨.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {rules.map((r) => (
              <li key={r.merchant} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex-1 truncate">{r.merchant}</span>
                <span className="text-[var(--ink-3)]">→</span>
                {r.categoryName ? (
                  <TagChip name={r.categoryName} index={r.index} />
                ) : (
                  <span className="text-xs text-[var(--ink-3)]">삭제된 태그</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-[var(--ink-3)]">
          거래처 이름이 정확히 같을 때만 반영. 비슷한 이름은 서로 다른 곳일 수 있어 좁게 잡음.
        </p>
      </Panel>

      <Panel>
        <PanelTitle hint="매달 반복되는 항목">반복</PanelTitle>
        <RecurringManager items={recurring} categories={categories} />
      </Panel>

      <Panel>
        <PanelTitle hint="기록은 이 기기 안에만 존재">백업</PanelTitle>
        <BackupPanel dataDir={dataDir()} />
      </Panel>
    </div>
  );
}
