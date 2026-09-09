import { getDb } from '@/lib/db';
import { getImage, readImageBytes } from '@/lib/repo/images';

/**
 * 근거 이미지 보기 — FR-ENTRY-13.
 * 파일은 기기 안(data/images)에 있고 이 경로는 그것을 그대로 돌려줄 뿐이다.
 * 밖으로 나가는 통신이 아니다.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const db = getDb();
  const meta = getImage(id, db);
  if (!meta) return new Response('없는 이미지입니다', { status: 404 });

  const bytes = readImageBytes(id, db);
  if (!bytes) {
    // 기록은 남아 있는데 파일이 사라진 경우. 기록이 잘못됐다는 뜻이 아니다.
    return new Response('이미지 파일을 찾지 못했습니다', { status: 410 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': meta.mime,
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
}
