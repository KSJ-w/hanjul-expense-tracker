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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <div className="app-shell">
            <div className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-6 pt-4">
              <Nav />
              <main className="mt-5 flex-1 pb-2">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
