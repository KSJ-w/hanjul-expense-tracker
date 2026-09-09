import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS, PRAGMAS } from './schema';
import { seedCategoriesIfEmpty } from './seed';

/**
 * 저장 위치 — ADR-002 / NFR-ENTRY-05.
 * 기록과 근거 이미지는 사용자 기기 안에만 있다. 기본값은 프로젝트 아래 data/.
 */
export function dataDir(): string {
  return process.env.EXPENSE_DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function imagesDir(): string {
  return path.join(dataDir(), 'images');
}

/**
 * 근거 이미지 한 장의 실제 경로.
 *
 * 파일 접근을 이 함수 하나로 모은 이유: 번들러의 정적 분석이 동적 경로를 보면
 * "프로젝트 전체를 서버 출력에 포함"하는 쪽으로 판단해 배포 크기가 불필요하게 커진다.
 * 경로가 실제로 동적인 것은 맞다(EXPENSE_DATA_DIR 로 바꿀 수 있어야 NFR-ENTRY-05 를
 * 검사할 수 있다). 그래서 추적에서만 빼고 동작은 그대로 둔다.
 */
export function imagePath(relPath: string): string {
  return path.join(/* turbopackIgnore: true */ imagesDir(), relPath);
}

let cached: DatabaseSync | null = null;

export function openDb(file?: string): DatabaseSync {
  const target = file ?? path.join(dataDir(), 'expense.db');
  if (target !== ':memory:') {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(imagesDir(), { recursive: true });
  }
  const db = new DatabaseSync(target);
  for (const p of PRAGMAS) {
    // WAL 은 메모리 DB 에서 의미가 없다. 실패해도 진행한다.
    try {
      db.exec(p);
    } catch {
      /* noop */
    }
  }
  migrate(db);
  seedCategoriesIfEmpty(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map((r) => r.id),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    db.exec(m.sql);
    db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(
      m.id,
      new Date().toISOString(),
    );
  }
}

/** 앱 전역에서 쓰는 연결. 단일 사용자이므로 하나면 충분하다(SRS §9 제약). */
export function getDb(): DatabaseSync {
  if (!cached) cached = openDb();
  return cached;
}

/** 시험에서 연결을 갈아끼울 때 쓴다. */
export function _setDbForTest(db: DatabaseSync | null): void {
  cached = db;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
