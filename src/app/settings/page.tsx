import { getDb } from '@/lib/db';
import { listCategories } from '@/lib/repo/categories';
import { Panel, SectionTitle } from '../ui/atoms';
import { CategoryManager } from '../ui/CategoryManager';

export const dynamic = 'force-dynamic';

/**
 * 태그 — 태그를 만들고 이름을 고치는 화면.
 *
 * 전에는 반복 기록·자동 태그 규칙·백업·외부 전송 안내까지 한 화면에 있었다.
 * 지금은 태그만 맡는다(한 목적지는 한 목적만 맡는다 — ADR-020).
 */
export default function TagsPage() {
  const db = getDb();
  const categories = listCategories(undefined, db);

  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-[24px] font-bold tracking-tight">태그</h1>

      <Panel className="p-4 sm:p-5">
        <SectionTitle hint={`${categories.length}개`}>태그 관리</SectionTitle>
        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryManager categories={categories} direction="expense" />
          <CategoryManager categories={categories} direction="income" />
        </div>
      </Panel>
    </div>
  );
}
