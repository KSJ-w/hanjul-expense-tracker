'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { todayISO } from '@/lib/domain/date';
import type { Candidate, Direction, UnresolvedField } from '@/lib/domain/types';
import { listCategories, addCategory, renameCategory, deleteCategory } from '@/lib/repo/categories';
import {
  saveCandidates,
  updateCandidate,
  confirmCandidate,
  discardCandidate,
  type CandidatePatch,
} from '@/lib/repo/candidates';
import {
  createRecord,
  updateRecord,
  deleteRecord,
  restoreRecord,
  lastDeletedRecord,
} from '@/lib/repo/records';
import { setBudget, clearBudget } from '@/lib/repo/budgets';
import { addRecurring, removeRecurring, setRecurringActive } from '@/lib/repo/recurring';
import { saveDataUrl } from '@/lib/repo/images';
import { importBundle } from '@/lib/transfer';
import { interpret } from '@/lib/interpret';

function refresh(): void {
  revalidatePath('/', 'layout');
}

export interface StageResult {
  ok: boolean;
  count: number;
  /** 방금 세운 후보. 화면이 이것으로 확인 팝업을 연다(FR-ENTRY-05). */
  candidates: Candidate[];
  degraded: boolean;
  failure?: string;
  failureDetail?: string;
  providerName: string;
  elapsedMs: number;
  message?: string;
}

/**
 * 입력을 해석해 기록 후보로 세운다. 확정하지 않는다(FR-ENTRY-05).
 * 해석이 실패해도 원문을 담은 후보를 만들어 사람이 이어받게 한다(FR-ENTRY-07).
 */
export async function stageFromInput(text: string, imageDataUrl?: string): Promise<StageResult> {
  const db = getDb();
  const trimmed = text.trim();
  if (!trimmed && !imageDataUrl) {
    return { ok: false, count: 0, candidates: [], degraded: false, providerName: '-', elapsedMs: 0, message: '입력 없음' };
  }

  let imageId: string | null = null;
  let imageBase64: string | undefined;
  let imageMime: string | undefined;
  if (imageDataUrl) {
    const saved = saveDataUrl(imageDataUrl, db);
    if (!saved.ok) {
      const why =
        saved.reason === 'too-large'
          ? '이미지 용량 초과'
          : saved.reason === 'unsupported-type'
            ? 'JPG·PNG·WEBP 만 가능'
            : '빈 이미지';
      return { ok: false, count: 0, candidates: [], degraded: false, providerName: '-', elapsedMs: 0, message: why };
    }
    imageId = saved.image.id;
    const m = /^data:([^;]+);base64,(.+)$/s.exec(imageDataUrl);
    if (m) {
      imageMime = m[1];
      imageBase64 = m[2];
    }
  }

  const outcome = await interpret({
    text: trimmed || undefined,
    image: imageBase64 && imageMime ? { base64: imageBase64, mime: imageMime } : undefined,
    today: todayISO(),
    categories: listCategories(undefined, db),
  });

  const drafts =
    outcome.items.length > 0
      ? outcome.items.map((i) => ({
          source: (imageId ? 'image' : 'text') as 'image' | 'text',
          rawInput: trimmed,
          date: i.date,
          amount: i.amount,
          direction: i.direction,
          categoryId: i.categoryId,
          merchant: i.merchant,
          note: i.note || trimmed,
          imageId,
          unresolved: [] as UnresolvedField[],
          providerName: outcome.providerName,
        }))
      : [
          {
            // 해석이 아무것도 못 만들어도 원문은 살린다.
            source: (imageId ? 'image' : 'text') as 'image' | 'text',
            rawInput: trimmed,
            date: todayISO(),
            amount: null,
            direction: null,
            categoryId: null,
            merchant: null,
            note: trimmed,
            imageId,
            unresolved: [] as UnresolvedField[],
            providerName: outcome.providerName,
          },
        ];

  const created = saveCandidates(drafts, db);
  refresh();

  return {
    ok: true,
    count: created.length,
    candidates: created,
    degraded: outcome.degraded,
    failure: outcome.failure,
    failureDetail: outcome.failureDetail,
    providerName: outcome.providerName,
    elapsedMs: outcome.elapsedMs,
  };
}

export async function patchCandidate(id: string, patch: CandidatePatch): Promise<void> {
  updateCandidate(id, patch, getDb());
  refresh();
}

export type ConfirmActionResult =
  | { ok: true }
  | { ok: false; message: string; missing?: UnresolvedField[] };

export async function confirmCandidateAction(id: string): Promise<ConfirmActionResult> {
  const r = confirmCandidate(id, getDb());
  refresh();
  if (r.ok) return { ok: true };
  if (r.reason === 'unresolved') {
    const names: Record<UnresolvedField, string> = {
      date: '날짜',
      amount: '금액',
      direction: '수입/지출',
      category: '분류',
    };
    return {
      ok: false,
      missing: r.fields,
      message: `미확정: ${r.fields.map((f) => names[f]).join('·')}`,
    };
  }
  return { ok: false, message: '저장 실패' };
}

export async function discardCandidateAction(id: string): Promise<void> {
  discardCandidate(id, getDb());
  refresh();
}

export interface ManualInput {
  date: string;
  amount: number;
  direction: Direction;
  categoryId: string | null;
  note: string;
  merchant?: string | null;
}

export async function createRecordAction(
  input: ManualInput,
): Promise<{ ok: boolean; message?: string }> {
  const r = createRecord(input, getDb());
  refresh();
  if (r.ok) return { ok: true };
  const msg: Record<string, string> = {
    'invalid-date': '날짜 형식 오류',
    'invalid-amount': '금액은 1원 이상',
    'invalid-direction': '수입/지출 미선택',
  };
  return { ok: false, message: msg[r.reason] ?? '저장 실패' };
}

export async function updateRecordAction(
  id: string,
  patch: Partial<ManualInput>,
): Promise<{ ok: boolean; message?: string }> {
  const r = updateRecord(id, patch, getDb());
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: '수정 실패' };
}

export async function deleteRecordAction(id: string): Promise<{ ok: boolean }> {
  const r = deleteRecord(id, getDb());
  refresh();
  return r;
}

export async function restoreLastDeletedAction(): Promise<{ ok: boolean; message?: string }> {
  const db = getDb();
  const last = lastDeletedRecord(db);
  if (!last) return { ok: false, message: '복원할 기록 없음' };
  const r = restoreRecord(last.id, db);
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: '복원 실패' };
}

export async function restoreRecordAction(id: string): Promise<{ ok: boolean }> {
  const r = restoreRecord(id, getDb());
  refresh();
  return r;
}

/* ------------------------------------------------------------------ 분류 */

export async function addCategoryAction(
  name: string,
  direction: Direction,
): Promise<{ ok: boolean; message?: string }> {
  const r = addCategory(name, direction, getDb());
  refresh();
  if (r.ok) return { ok: true };
  return {
    ok: false,
    message: r.reason === 'duplicate-name' ? '같은 이름의 태그 존재' : '이름 필요',
  };
}

export async function renameCategoryAction(
  id: string,
  name: string,
): Promise<{ ok: boolean; message?: string }> {
  const r = renameCategory(id, name, getDb());
  refresh();
  if (r.ok) return { ok: true };
  return {
    ok: false,
    message: r.reason === 'duplicate-name' ? '같은 이름의 태그 존재' : '이름 필요',
  };
}

export async function deleteCategoryAction(
  id: string,
  confirmed: boolean,
): Promise<{ ok: boolean; needsConfirm?: boolean; recordCount?: number; message?: string }> {
  const r = deleteCategory(id, { confirmed }, getDb());
  refresh();
  if (r.ok) return { ok: true };
  if (r.reason === 'has-records') {
    return {
      ok: false,
      needsConfirm: true,
      recordCount: r.recordCount,
      message: `이 태그에 기록 ${r.recordCount}건. 삭제해도 지난 기록의 태그는 유지됨.`,
    };
  }
  return { ok: false, message: '삭제 실패' };
}

/* ------------------------------------------------------------------ 예산 */

export async function setBudgetAction(
  categoryId: string,
  periodKey: string,
  amount: number,
): Promise<{ ok: boolean; message?: string }> {
  const r = setBudget(categoryId, periodKey, amount, getDb());
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: '예산 저장 실패' };
}

export async function clearBudgetAction(categoryId: string, periodKey: string): Promise<void> {
  clearBudget(categoryId, periodKey, getDb());
  refresh();
}

/* --------------------------------------------------------------- 반복 항목 */

export async function addRecurringAction(input: {
  name: string;
  amount: number;
  direction: Direction;
  categoryId: string | null;
  anchorDay: number;
  note?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const r = addRecurring(input, getDb());
  refresh();
  return r.ok ? { ok: true } : { ok: false, message: '값 확인 필요' };
}

export async function removeRecurringAction(id: string): Promise<void> {
  removeRecurring(id, getDb());
  refresh();
}

export async function toggleRecurringAction(id: string, active: boolean): Promise<void> {
  setRecurringActive(id, active, getDb());
  refresh();
}

/* ------------------------------------------------------------------ 반입 */

export async function importBundleAction(
  json: string,
): Promise<{ ok: boolean; message: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: '파일 읽기 실패' };
  }
  const r = importBundle(parsed, getDb());
  refresh();
  if (!r.ok) return { ok: false, message: `들여오기 실패 — ${r.detail}` };
  return {
    ok: true,
    message: `들여오기 ${r.imported}건 · 건너뜀 ${r.skipped}건 · 이미지 ${r.imagesRestored}건`,
  };
}
