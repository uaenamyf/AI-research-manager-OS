import nextVitals from "eslint-config-next/core-web-vitals";

// ESLint 9 flat config：eslint-config-next@16 已原生输出 flat config 数组，
// 直接展开使用（勿再用 FlatCompat，否则循环引用报错）
const eslintConfig = [
  {
    // 测试文件由 vitest / playwright 自己的 runner 管理，不参与 ESLint
    ignores: ["tests/**", "playwright.config.ts"],
  },
  // eslint-config-next@16 已原生输出 flat config，直接展开。
  // 注意：flat config 后定义者优先，覆盖规则必须放在展开之后。
  ...nextVitals,
  {
    rules: {
      // React 19 激进新规则：对既有"effect 初始化状态"模式误报较多，
      // 降为 warning（不阻塞 CI），仍保留可见性
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
