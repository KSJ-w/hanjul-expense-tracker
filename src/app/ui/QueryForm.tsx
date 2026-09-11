'use client';

import { useRouter } from 'next/navigation';

/**
 * 같은 화면에서 **조건만 바꾸는** GET 폼 — ADR-038.
 *
 * 네이티브 `<form method="get">` 은 브라우저가 **문서를 통째로 다시 받는다.**
 * 화면이 하얘졌다가 처음부터 그려지고, 스크롤은 맨 위로 가고, 클라이언트에
 * 남아 있던 것(열린 창·적던 글)이 전부 사라진다. 바뀌는 것은 목록 한 덩어리인데
 * 값은 화면 전체다.
 *
 * 그래서 전송만 가로채 `router.push` 로 옮긴다. Next 가 바뀐 부분만 다시 그리고
 * `scroll: false` 로 보던 자리도 지킨다. `method`·`action` 은 그대로 두므로
 * 자바스크립트가 없는 환경에서는 예전처럼 동작한다 — 빼앗는 것 없이 더한다.
 *
 * 빈 칸은 주소에 싣지 않는다. 화면은 빈 문자열을 '조건 없음'으로 읽으므로
 * (`sp.q || undefined`) 값은 같고, 주소만 짧아지며 '지운 조건'이 되살아나지 않는다.
 */
export function QueryForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <form
      method="get"
      action={action}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const query = new URLSearchParams();
        for (const [key, value] of new FormData(e.currentTarget).entries()) {
          if (typeof value === 'string' && value !== '') query.set(key, value);
        }
        const qs = query.toString();
        router.push(qs ? `${action}?${qs}` : action, { scroll: false });
      }}
    >
      {children}
    </form>
  );
}
