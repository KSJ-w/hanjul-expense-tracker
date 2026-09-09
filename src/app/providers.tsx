'use client';

import { I18nProvider } from '@react-aria/i18n';

/**
 * 지역 설정을 한국어로 고정한다.
 * 달력의 요일·월 이름과 날짜 표기가 브라우저 설정에 좌우되지 않게 한다.
 * 컨텍스트를 쓰므로 반드시 클라이언트 경계 안에 있어야 한다.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="ko-KR">{children}</I18nProvider>;
}
