import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { Nav } from './ui/Nav';
import './globals.css';

/**
 * 제목을 `metadata` 가 아니라 **레이아웃의 JSX** 로 둔다 — ADR-039.
 *
 * Next 는 화면마다 metadata 를 따로 흘려보낸다. 그래서 같은 화면에서 조건만
 * 바꿔도 `<title>` 이 한 번 지워졌다가 다시 꽂히는데, 그 사이(60ms 남짓)
 * 문서에 제목이 없어 **브라우저 탭이 주소를 보여 준다**(실제로 겪음 —
 * 3개월/6개월을 누르면 탭 이름이 잠깐 URL 이 되었다).
 *
 * 레이아웃은 같은 라우트 안에서 다시 그려지지 않으므로, 제목을 여기에 두면
 * 지워질 일이 없다. React 19 가 `<title>` 을 head 로 끌어올린다.
 */
export const metadata: Metadata = {
  description: '달력 중심 가계부',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * 셸 — ADR-021.
 *
 * 내비게이션은 상단 하나뿐이다. **하단은 기록 입력 프롬프트의 자리로 비워 둔다.**
 * 프롬프트가 있는 화면은 스스로 `has-dock` 으로 바닥 여백을 확보한다.
 * 콘텐츠 최대 폭은 1056px — 달력과 프롬프트가 같은 좌우 끝을 갖도록 맞춘 값이다(§8).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <title>한줄 가계부</title>
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <Nav />
            <main className="mx-auto w-full max-w-[1056px] flex-1 px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
