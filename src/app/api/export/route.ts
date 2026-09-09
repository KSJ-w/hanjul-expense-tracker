import { getDb } from '@/lib/db';
import { exportBundle } from '@/lib/transfer';
import { todayISO } from '@/lib/domain/date';

/**
 * FR-VIEW-10 — 반출.
 * ADR-008 에 따라 기록과 근거 이미지를 한 묶음으로 담는다.
 * 이미지를 빼면 NFR-VIEW-03(파일만으로 복원)이 이미지에 대해 성립하지 않으므로,
 * 빼는 것은 사용자가 명시적으로 고를 때만 한다.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const includeImages = url.searchParams.get('images') !== '0';
  const bundle = exportBundle({ includeImages }, getDb());
  const body = JSON.stringify(bundle, null, 2);

  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="gagyebu-${todayISO()}.json"`,
      'cache-control': 'no-store',
    },
  });
}
