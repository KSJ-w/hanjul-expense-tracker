import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // node:sqlite 는 서버에서만 쓴다. 번들러가 클라이언트로 끌고 가지 않게 외부화한다.
  serverExternalPackages: ['node:sqlite'],
  experimental: {
    // 근거 이미지는 원본 크기가 클 수 있다. 업로드 상한은 API 라우트에서 다시 검사한다.
    serverActions: { bodySizeLimit: '12mb' },
  },
};

export default nextConfig;
