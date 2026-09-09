import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDb, _setDbForTest } from '@/lib/db';
import { listCategories } from '@/lib/repo/categories';
import { interpret } from '@/lib/interpret';
import { heuristicProvider } from '@/lib/interpret/heuristic';
import type { InterpretOutcome } from '@/lib/interpret/types';

export const TODAY = '2026-09-08'; // 화요일. 이번 주는 09-07(월) ~ 09-13(일)

export interface TestEnv {
  db: DatabaseSync;
  dir: string;
}

/** 시험마다 새 저장소. 상태가 시험 사이로 넘어가지 않는다. */
export function freshDb(): TestEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-tracker-test-'));
  process.env.EXPENSE_DATA_DIR = dir;
  const db = openDb(path.join(dir, 'test.db'));
  _setDbForTest(db);
  return { db, dir };
}

export function cleanup(env: TestEnv): void {
  try {
    env.db.close();
  } catch {
    /* noop */
  }
  _setDbForTest(null);
  try {
    fs.rmSync(env.dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

export function categoryIdByName(name: string, db: DatabaseSync): string {
  const c = listCategories(undefined, db).find((x) => x.name === name);
  if (!c) throw new Error(`분류를 찾지 못함: ${name}`);
  return c.id;
}

/** 기기 안 수단으로만 해석한다(외부 키 없이 동작하는 경로). */
export async function interpretText(
  text: string,
  db: DatabaseSync,
  today: string = TODAY,
): Promise<InterpretOutcome> {
  return heuristicProvider.interpret({
    text,
    today,
    categories: listCategories(undefined, db),
  });
}

/** 경계를 통과하는 해석(수단 선택·대체 포함). */
export async function interpretViaBoundary(
  text: string,
  db: DatabaseSync,
  today: string = TODAY,
): Promise<InterpretOutcome> {
  return interpret({ text, today, categories: listCategories(undefined, db) });
}
