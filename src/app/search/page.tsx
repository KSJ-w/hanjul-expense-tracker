import { SearchChat } from '../ui/SearchChat';

export const dynamic = 'force-dynamic';

/**
 * 내역 — 묻고 답하는 화면(FR-VIEW-13, ADR-041).
 *
 * 이 파일에 조회가 없다. 해석과 조회를 한 턴에 끝내는 `searchTurnAction` 이 그
 * 일을 하고, 여기는 대화가 놓일 자리만 연다. 처음에는 **아무것도 없다** —
 * 빈 바탕이 곧 '아직 묻지 않았다'는 뜻이고, 무엇을 하라는 말은 프롬프트의
 * 자리 표시가 이미 하고 있다.
 */
export default function HistoryPage() {
  return (
    <div className="has-dock flex flex-col gap-5">
      <h1 className="text-[24px] font-bold tracking-tight">어떤 기록을 찾아 드릴까요?</h1>
      <SearchChat />
    </div>
  );
}
