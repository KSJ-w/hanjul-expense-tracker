import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { Nav } from './ui/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: '한줄 가계부',
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
