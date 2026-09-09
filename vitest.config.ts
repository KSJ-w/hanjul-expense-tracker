import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // 리포트 생성기(test/generate-report.mjs)는 CLI 로 json 리포터를 켠다.
    // 테스트 이름에 [TC-<COMP>-NN] 을 넣는 것이 태깅 규약이다.
    globals: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
});
