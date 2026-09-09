import { getDb } from '@/lib/db';
import { exportCsv } from '@/lib/transfer';
import { todayISO } from '@/lib/domain/date';

/**
 * 표 계산 도구에서 열어 보기 위한 CSV.
 * 복원용이 아니다 — 복원은 /api/export 의 묶음이 담당한다(NFR-VIEW-03).
 */
export async function GET(): Promise<Response> {
  return new Response(exportCsv(getDb()), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="gagyebu-${todayISO()}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
