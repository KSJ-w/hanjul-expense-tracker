import { SearchChat } from '../ui/SearchChat';

export const dynamic = 'force-dynamic';

/**
 * 내역 — 묻고 답하는 화면(FR-VIEW-13, ADR-041).
 *
 * 이 파일에 조회가 없다. 해석과 조회를 한 턴에 끝내는 `searchTurnAction` 이 그
 * 일을 하고, 여기는 대화가 놓일 자리만 연다.
 *
 * h1 은 **목적지 이름**이다. 네 화면이 같은 규칙을 쓰므로 여기만 물음으로 바꾸지
 * 않는다 — 내비게이션에서 '내역'을 눌렀는데 제목이 '내역'이 아니면 누른 곳과
 * 도착한 곳의 이름이 갈린다. 처음 부르는 말은 대화가 비었을 때만 `SearchChat`
 * 안에 선다(ADR-045).
 */
export default function HistoryPage() {
  return (
    <div className="has-dock flex flex-col gap-5">
      <h1 className="text-[24px] font-bold tracking-tight">내역</h1>
      <SearchChat />
    </div>
  );
}
