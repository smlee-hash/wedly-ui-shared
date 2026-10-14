import { defineConfig } from "vitest/config";

export default defineConfig({
  // .tsx 테스트(UnifiedDetailView 렌더)용 — JSX 는 자동 런타임, react 는 한 벌만 쓴다. 기본 환경은 node, jsdom 은 파일 상단 지시어로.
  esbuild: { jsx: "automatic" },
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
