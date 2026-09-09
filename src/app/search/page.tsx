import Link from 'next/link';
import { getDb } from '@/lib/db';
import { listCategories } from '@/lib/repo/categories';
import { queryRecords } from '@/lib/repo/records';
import type { Direction, RecordQuery } from '@/lib/domain/types';
import { btn, DirectionChip, EmptyNote, inputClass, Money, Panel, PanelTitle, TagChip } from '../ui/atoms';

export const dynamic = 'force-dynamic';

/**
 * 검색 — FR-VIEW-06. 대시보드 안에 있던 것을 자기 탭으로 뺐다(ADR-013).
 * 조건을 만족하는 기록만 돌려주며, 0건은 부재가 아니다(FR-VIEW-07).
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const categories = listCategories(undefined, db);

  const q: RecordQuery = {
    from: sp.from || undefined,
    to: sp.to || undefined,
    categoryId: sp.cat || undefined,
    direction: (sp.dir as Direction) || undefined,
    amountMin: sp.min ? Number(sp.min) : undefined,
    amountMax: sp.max ? Number(sp.max) : undefined,
    text: sp.q || undefined,
    limit: 200,
  };
  const searching = Boolean(sp.from || sp.to || sp.cat || sp.dir || sp.min || sp.max || sp.q);
  const found = searching ? queryRecords(q, db) : null;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelTitle hint={found ? `${found.items.length}건` : '조건 입력'}>검색</PanelTitle>

        <form method="get" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">시작</span>
            <input type="date" name="from" defaultValue={sp.from ?? ''} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">끝</span>
            <input type="date" name="to" defaultValue={sp.to ?? ''} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">수입/지출</span>
            <select name="dir" defaultValue={sp.dir ?? ''} className={inputClass}>
              <option value="">전체</option>
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">태그</span>
            <select name="cat" defaultValue={sp.cat ?? ''} className={inputClass}>
              <option value="">전체</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">최소</span>
            <input name="min" inputMode="numeric" defaultValue={sp.min ?? ''} className={`${inputClass} tabular`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">최대</span>
            <input name="max" inputMode="numeric" defaultValue={sp.max ?? ''} className={`${inputClass} tabular`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--ink-2)]">내용</span>
            <input name="q" defaultValue={sp.q ?? ''} placeholder="회식" className={inputClass} />
          </label>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-7">
            <button type="submit" className={btn.primary}>
              검색
            </button>
            <Link href="/search" className={btn.ghost}>
              초기화
            </Link>
          </div>
        </form>

        {found ? (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            {found.items.length === 0 ? (
              <EmptyNote title="조건에 맞는 기록 없음" />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {found.items.map((r) => {
                  const cat = categories.find((c) => c.id === r.categoryId);
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <Link
                        href={`/?m=${r.date.slice(0, 7)}`}
                        className="tabular w-24 shrink-0 text-xs text-[var(--primary)] underline-offset-2 hover:underline"
                      >
                        {r.date}
                      </Link>
                      <DirectionChip direction={r.direction} />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.note || '내용 없음'}</span>
                      {cat ? <TagChip name={cat.name} index={categories.indexOf(cat)} /> : null}
                      <Money amount={r.amount} direction={r.direction} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
