import { getDb } from '@/lib/db';
import { listCategories } from '@/lib/repo/categories';
import { Panel, PanelTitle } from '../ui/atoms';
import { TagManager } from '../ui/TagManager';

export const dynamic = 'force-dynamic';

/**
 * 태그 — 태그 관리만 맡는다(ADR-013).
 * 자동 배정 기억·반복·백업은 `/etc` 로 옮겼다.
 */
export default function TagsPage() {
  const db = getDb();
  const categories = listCategories(undefined, db);

  return (
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
  );
}
