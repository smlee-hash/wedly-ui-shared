import { defineConfig } from "vitest/config";

export default defineConfig({
  // .tsx 시험이 그리는 화면은 React 를 직접 import 하지 않는다 — 자동 JSX 변환으로 돌리고, react 는 한 벌만 쓰게 한다.
  esbuild: { jsx: "automatic" },
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // 기본은 node — 화면(DOM) 시험은 파일 맨 위 `// @vitest-environment jsdom` 으로 따로 고른다.
    environment: "node",
  },
});
