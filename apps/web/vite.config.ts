import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  // 워크스페이스 packages/shared 는 CJS 출력이라 rollup commonjs 플러그인의
  // 변환 대상에 명시적으로 포함시켜야 named export 가 분석된다.
  build: {
    commonjsOptions: {
      include: [/packages\/shared/, /node_modules/],
    },
  },
  optimizeDeps: {
    include: ['@sam/shared'],
  },
});
