import { dataDir, getDb } from '@/lib/db';
import { currentOutboundFields, interpretationStatus } from '@/lib/interpret';
import { getCategoryName, listCategories } from '@/lib/repo/categories';
import { listMerchantRules } from '@/lib/repo/merchantRules';
import { listRecurring } from '@/lib/repo/recurring';
import { CategoryChip, Panel, SectionTitle } from '../ui/atoms';
import { CategoryManager } from '../ui/CategoryManager';
import { RecurringManager } from '../ui/RecurringManager';
import { BackupPanel } from '../ui/BackupPanel';

export const dynamic = 'force-dynamic';

/**
 * 설정 — 분류·반복 기록·자동 분류 규칙·데이터와 백업·입력 처리 안내(ADR-020, §16).
 *
 * 전에는 '태그'와 '기타' 두 탭에 흩어져 있었고, 기타는 이름이 내용을 설명하지
 * 못하는 임시 묶음이었다. 목적별 구역과 목차로 다시 묶었다.
 */
const SECTIONS = [
  { id: 'categories', label: '태그 관리' },
  { id: 'recurring', label: '반복 기록' },
  { id: 'rules', label: '자동 태그 규칙' },
  { id: 'data', label: '데이터와 백업' },
  { id: 'outbound', label: '입력 처리와 외부 전송' },
];

export default function SettingsPage() {
  const db = getDb();
  const categories = listCategories(undefined, db);
  const recurring = listRecurring(db);
  const rules = listMerchantRules(db).map((r) => ({
    ...r,
    categoryName: getCategoryName(r.categoryId, db),
  }));

  // FR-ENTRY-16 — 나가는 항목의 조회 지점.
  const outbound = currentOutboundFields();
  const { usesNetwork } = interpretationStatus();

  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-[24px] font-bold tracking-tight">설정</h1>

      <nav aria-label="설정 목차">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex h-9 items-center rounded-[var(--r-chip)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--ink-2)] hover:text-[var(--ink)]"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Panel id="categories" className="scroll-mt-6 p-4 sm:p-5">
        <SectionTitle hint={`${categories.length}개`}>태그 관리</SectionTitle>
        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryManager categories={categories} direction="expense" />
          <CategoryManager categories={categories} direction="income" />
        </div>
      </Panel>

      <Panel id="recurring" className="scroll-mt-6 p-4 sm:p-5">
        <SectionTitle hint={`${recurring.length}개`}>반복 기록</SectionTitle>
        <p className="mb-4 text-[13px] text-[var(--ink-2)]">
          예정일에 저장 전 확인 목록에 추가돼요. 자동으로 저장되지는 않아요.
        </p>
        <RecurringManager items={recurring} categories={categories} />
      </Panel>

      <Panel id="rules" className="scroll-mt-6 p-4 sm:p-5">
        <SectionTitle hint={`${rules.length}개`}>자동 태그 규칙</SectionTitle>
        <p className="mb-4 text-[13px] text-[var(--ink-2)]">
          저장 전 확인에서 태그를 고치면, 같은 거래처 이름이 정확히 일치할 때 다음부터 그 태그로 채워요.
        </p>
        {rules.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-[var(--ink-2)]">아직 기억한 규칙이 없어요.</p>
        ) : (
          <ul className="flex flex-col">
            {rules.map((r) => (
              <li
                key={r.merchant}
                className="flex items-center gap-3 border-b border-[var(--line)] py-3 text-[15px] last:border-0"
              >
                <span className="min-w-0 flex-1 truncate">{r.merchant}</span>
                <span aria-hidden className="text-[var(--ink-3)]">
                  →
                </span>
                {r.categoryName ? (
                  <CategoryChip name={r.categoryName} />
                ) : (
                  <span className="text-[13px] text-[var(--ink-3)]">보관한 태그</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel id="data" className="scroll-mt-6 p-4 sm:p-5">
        <SectionTitle>데이터와 백업</SectionTitle>
        <BackupPanel dataDir={dataDir()} />
      </Panel>

      <Panel id="outbound" className="scroll-mt-6 p-4 sm:p-5">
        <SectionTitle hint={usesNetwork ? '해석을 요청할 때만' : '기기 안에서만 처리'}>
          입력 처리와 외부 전송
        </SectionTitle>
        {outbound.length === 0 ? (
          <p className="text-[15px] text-[var(--ink-2)]">
            지금은 기기 안에서만 해석해요. 밖으로 나가는 항목이 없어요.
          </p>
        ) : (
          <>
            {/*
              * 나가는 때를 **빠짐없이** 적는다. 내역 검색이 해석을 쓰게 되면서
              * (FR-VIEW-13) 나가는 때가 둘이 되었는데 이 문장이 '조회에서는
              * 나가지 않는다'고 말하고 있었다 — 안내와 실제가 어긋나면
              * `FR-ENTRY-16` 은 지켜지지 않은 것이다(§8).
              */}
            <p className="mb-4 text-[13px] text-[var(--ink-2)]">
              해석을 요청할 때 — <strong className="font-semibold">기록을 적을 때와 내역을 찾을 때</strong> —
              아래 항목이 외부로 나가요. 합계·달력·백업에서는 나가지 않아요.
            </p>
            <ul className="flex flex-col">
              {outbound.map((f) => (
                <li key={f.key} className="border-b border-[var(--line)] py-3 last:border-0">
                  <p className="text-[15px] font-medium">{f.label}</p>
                  <p className="mt-0.5 text-[13px] text-[var(--ink-2)]">{f.detail}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
