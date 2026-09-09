import type { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { getDb, imagePath, imagesDir, newId, nowISO } from '../db';
import type { SourceImage } from '../domain/types';

/**
 * 근거 이미지 — ADR-007.
 * 파일은 data/images 아래에 두고 DB 에는 경로만 남긴다.
 * 파일이 기기 안에 있다는 사실이 NFR-ENTRY-05 의 검사 지점이다.
 */

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

/** 한 장의 상한. 이보다 큰 것은 받지 않는다. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type SaveImageResult =
  | { ok: true; image: SourceImage }
  | { ok: false; reason: 'unsupported-type' | 'too-large' | 'empty' };

export function saveImage(
  data: Buffer,
  mime: string,
  db: DatabaseSync = getDb(),
): SaveImageResult {
  if (data.byteLength === 0) return { ok: false, reason: 'empty' };
  if (data.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: 'too-large' };
  const ext = ALLOWED.get(mime);
  if (!ext) return { ok: false, reason: 'unsupported-type' };

  const id = newId('img');
  const rel = `${id}.${ext}`;
  fs.mkdirSync(imagesDir(), { recursive: true });
  fs.writeFileSync(imagePath(rel), data);

  db.prepare('INSERT INTO images (id, rel_path, mime, bytes, created_at) VALUES (?,?,?,?,?)').run(
    id,
    rel,
    mime,
    data.byteLength,
    nowISO(),
  );
  return {
    ok: true,
    image: { id, relPath: rel, mime, bytes: data.byteLength, createdAt: nowISO() },
  };
}

export function getImage(id: string, db: DatabaseSync = getDb()): SourceImage | null {
  const r = db
    .prepare('SELECT id, rel_path AS relPath, mime, bytes, created_at AS createdAt FROM images WHERE id = ?')
    .get(id) as unknown as SourceImage | undefined;
  return r ?? null;
}

export function readImageBytes(id: string, db: DatabaseSync = getDb()): Buffer | null {
  const img = getImage(id, db);
  if (!img) return null;
  try {
    return fs.readFileSync(imagePath(img.relPath));
  } catch {
    return null;
  }
}

/** data:image/jpeg;base64,... 를 받아 저장한다. */
export function saveDataUrl(dataUrl: string, db: DatabaseSync = getDb()): SaveImageResult {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return { ok: false, reason: 'unsupported-type' };
  return saveImage(Buffer.from(m[2], 'base64'), m[1], db);
}
