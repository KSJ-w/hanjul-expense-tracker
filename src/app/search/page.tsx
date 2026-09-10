import Link from 'next/link';
import { getDb } from '@/lib/db';
import { listCategories } from '@/lib/repo/categories';
import { queryRecords } from '@/lib/repo/records';
import { parseISODate } from '@/lib/domain/date';
import type { Direction, RecordQuery } from '@/lib/domain/types';
import { btn, CategoryChip, EmptyNote, Field, inputClass, Money, Panel, SectionTitle } from '../ui/atoms';
import { Select } from '../ui/Select';
import { AmountInput } from '../ui/AmountInput';

export const dynamic = 'force-dynamic';

const LIMIT = 200;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function groupLabel(iso: string, thisYear: string): string {
  const d = parseISODate(iso);
  const head = iso.slice(0, 4) === thisYear ? '' : `${d.getFullYear()}년 `;
  return `${head}${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
}

/**
 * 내역 — 기록 목록과 검색(ADR-020, 검수 §15).
 *
 * 기본은 '내역을 보고 필요하면 좁히기'다. 빈 화면에 입력칸 일곱 개부터 보여 주지 않는다.
 * 결과를 누르면 그 기록의 상세가 바로 열리고, 돌아오면 검색 조건이 남는다(검수 V10).
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const categories = listCategories(undefined, db);
  const thisYear = new Date().getFullYear().toString();

  const min = sp.min ? Number(sp.min.replace(/[^\d]/g, '')) : undefined;
  const max = sp.max ? Number(sp.max.replace(/[^\d]/g, '')) : undefined;

  const q: RecordQuery = {
    from: sp.from || undefined,
    to: sp.to || undefined,
    categoryId: sp.cat || undefined,
    direction: (sp.dir as Direction) || undefined,
    amountMin: Number.isFinite(min) ? min : undefined,
    amountMax: Number.isFinite(max) ? max : undefined,
    text: sp.q || undefined,
    limit: LIMIT,
  };
  const filtered = Boolean(sp.from || sp.to || sp.cat || sp.dir || sp.min || sp.max || sp.q);
  const found = queryRecords(q, db);

  // 조건이 서로 어긋나면 필드 옆에서 이유를 말한다(§15).
  const rangeError = sp.from && sp.to && sp.from > sp.to ? '시작일이 종료일보다 뒤예요.' : undefined;
  const amountError =
    min !== undefined && max !== undefined && min > max ? '최소 금액이 최대 금액보다 커요.' : undefined;

  // 돌아올 때 조건을 되살리기 위해 현재 질의를 그대로 넘긴다.
  const backQs = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][],
  ).toString();

  const groups: { date: string; items: typeof found.items }[] = [];
  for (const r of found.items) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.date) last.items.push(r);
    else groups.push({ date: r.date, items: [r] });
  }

  const activeChips: { label: string; key: string }[] = [];
  if (sp.from) activeChips.push({ label: `${sp.from}부터`, key: 'from' });
  if (sp.to) activeChips.push({ label: `${sp.to}까지`, key: 'to' });
  if (sp.dir) activeChips.push({ label: sp.dir === 'income' ? '수입만' : '지출만', key: 'dir' });
  if (sp.cat) {
    const c = categories.find((x) => x.id === sp.cat);
    activeChips.push({ label: c ? `분류 ${c.name}` : '분류 선택됨', key: 'cat' });
  }
  if (sp.min) activeChips.push({ label: `최소 ${sp.min}원`, key: 'min' });
  if (sp.max) activeChips.push({ label: `최대 ${sp.max}원`, key: 'max' });
  if (sp.q) activeChips.push({ label: `내용 "${sp.q}"`, key: 'q' });

  function without(key: string): string {
    const next = new URLSearchParams(
      Object.entries(sp).filter(([k, v]) => k !== key && v !== undefined) as [string, string][],
    );
    return `/search?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-[24px] font-bold tracking-tight">내역</h1>

      <Panel className="p-4 sm:p-5">
        <form method="get" className="flex flex-col gap-4">
          <Field label="내용 검색" htmlFor="f-q">
            <input id="f-q" name="q" defaultValue={sp.q ?? ''} placeholder="회식, 편의점" className={inputClass} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="시작일" htmlFor="f-from" error={rangeError}>
              <input id="f-from" type="date" name="from" defaultValue={sp.from ?? ''} className={inputClass} />
            </Field>
            <Field label="종료일" htmlFor="f-to">
              <input id="f-to" type="date" name="to" defaultValue={sp.to ?? ''} className={inputClass} />
            </Field>
            {/*
             * 이 화면은 서버 컴포넌트의 GET 폼이다. `Select` 는 값을 숨은 input 으로
             * 함께 보내므로 폼의 동작 방식은 그대로다(ADR-025).
             */}
            <Field label="수입과 지출" htmlFor="f-dir">
              <Select
                id="f-dir"
                name="dir"
                defaultValue={sp.dir ?? ''}
                placeholder="전체"
                options={[
                  { value: '', label: '전체' },
                  { value: 'expense', label: '지출' },
                  { value: 'income', label: '수입' },
                ]}
              />
            </Field>
            <Field label="분류" htmlFor="f-cat">
              <Select
                id="f-cat"
                name="cat"
                defaultValue={sp.cat ?? ''}
                placeholder="전체"
                options={[{ value: '', label: '전체' }]}
                groups={[
                  {
                    label: '지출',
                    options: categories
                      .filter((c) => c.direction === 'expense')
                      .map((c) => ({ value: c.id, label: c.name })),
                  },
                  {
                    label: '수입',
                    options: categories
                      .filter((c) => c.direction === 'income')
                      .map((c) => ({ value: c.id, label: c.name })),
                  },
                ]}
              />
            </Field>
          </div>

          {/* 금액 범위는 자주 쓰지 않으므로 접어 둔다(§15). */}
          <details className="rounded-[var(--r-control)] bg-[var(--surface-2)] px-3 py-2">
            <summary className="cursor-pointer text-[15px] text-[var(--ink-2)]">상세 필터</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* 서버는 숫자 아닌 글자를 걷어내고 읽으므로 자릿점이 찍힌 채 보내도 된다. */}
              <Field label="최소 금액" htmlFor="f-min" error={amountError}>
                <AmountInput id="f-min" name="min" defaultValue={sp.min ?? ''} aria-invalid={Boolean(amountError)} />
              </Field>
              <Field label="최대 금액" htmlFor="f-max">
                <AmountInput id="f-max" name="max" defaultValue={sp.max ?? ''} />
              </Field>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={btn.primary}>
              검색
            </button>
            <Link href="/search" className={btn.ghost}>
              조건 지우기
            </Link>
          </div>
        </form>

        {activeChips.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
            {activeChips.map((c) => (
              <li key={c.key}>
                <Link
                  href={without(c.key)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-chip)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--ink-2)] hover:text-[var(--ink)]"
                >
                  {c.label}
                  <span aria-hidden>✕</span>
                  <span className="sr-only">이 조건 지우기</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel className="p-4 sm:p-5">
        <SectionTitle
          hint={
            found.items.length >= LIMIT
              ? `최근 ${LIMIT}건 표시 · 더 있을 수 있어요`
              : `${found.items.length}건`
          }
        >
          {filtered ? '검색 결과' : '최근 기록'}
        </SectionTitle>

        {found.items.length >= LIMIT ? (
          <p className="mb-4 rounded-[var(--r-control)] bg-[var(--warn-bg)] px-3 py-2 text-[13px] text-[var(--warn-ink)]">
            한 번에 {LIMIT}건까지 보여 줘요. 전체 합계가 아니니 기간을 좁혀서 확인해 주세요.
          </p>
        ) : null}

        {found.items.length === 0 ? (
          filtered ? (
            <EmptyNote
              title="조건에 맞는 기록을 찾지 못했어요"
              action={
                <Link href="/search" className={btn.outline}>
                  조건 지우기
                </Link>
              }
            />
          ) : (
            <EmptyNote
              action={
                <Link href="/" className={btn.primary}>
                  달력에서 기록하기
                </Link>
              }
            />
          )
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <section key={g.date}>
                <h3 className="mb-1 text-[13px] font-medium text-[var(--ink-2)]">
                  {groupLabel(g.date, thisYear)}
                </h3>
                <ul className="flex flex-col">
                  {g.items.map((r) => {
                    const cat = categories.find((c) => c.id === r.categoryId);
                    return (
                      <li key={r.id} className="border-b border-[var(--line)] last:border-0">
                        {/* 결과를 누르면 그 기록의 상세가 바로 열린다(검수 V10). */}
                        <Link
                          href={`/?d=${r.date}&r=${r.id}&back=${encodeURIComponent(backQs)}`}
                          className="flex flex-col gap-1 rounded-[var(--r-control)] px-2 py-3 transition-colors hover:bg-[var(--surface-2)]"
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            {/* 내용이 없으면 자리만 지키는 '-' 를 흐리게 둔다(ADR-028). */}
                            <span
                              className={[
                                'min-w-0 flex-1 truncate text-[15px]',
                                r.note ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]',
                              ].join(' ')}
                              aria-label={r.note ? undefined : '내용 없음'}
                            >
                              {r.note || '-'}
                            </span>
                            <Money amount={r.amount} direction={r.direction} />
                          </span>
                          <span className="flex items-center gap-1.5 text-[13px] text-[var(--ink-3)]">
                            <span>{r.direction === 'income' ? '수입' : '지출'}</span>
                            <CategoryChip name={cat ? cat.name : '미분류'} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
