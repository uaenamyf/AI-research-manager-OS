# Frontend 模块规范

> 本文件约束 `frontend/` 目录下的所有开发。配合根 `CLAUDE.md`（编码规范）与 `Implementation/10-frontend.md`（实现方案）使用。

## 服务定位

- **角色**：前端工程师。
- **技术栈**：Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui。
- **唯一数据来源**：backend 的 `/api/*` 接口。

## 铁律（禁止事项）

1. ❌ **禁止直连 ai-service**：任何 AI 能力都通过 backend 转发，前端永远不直接调用 `ai-service:8000`。
2. ❌ **禁止直连数据库**：前端无任何数据库连接逻辑。
3. ❌ **禁止在客户端处理密钥**：LLM API key、`INTERNAL_TOKEN`、JWT secret 不得出现在客户端代码或环境变量中。前端只通过 httpOnly cookie 携带 JWT。
4. ❌ **禁止在客户端硬编码 API 地址**：统一用 `NEXT_PUBLIC_API_URL` 环境变量，经 `src/lib/api/client.ts` 封装调用。

## 目录职责

| 目录 | 职责 |
| --- | --- |
| `src/app/` | App Router 页面与路由，只做数据获取与组件编排 |
| `src/components/ui/` | shadcn/ui 基础组件 |
| `src/components/paper/` | 论文相关业务组件（PdfViewer、PaperCard、ChatPanel） |
| `src/components/layout/` | 布局组件（Sidebar、Header） |
| `src/lib/api/` | backend API 客户端，按资源拆分（papers.ts、chat.ts） |
| `src/lib/hooks/` | 自定义 React hooks |
| `src/lib/utils/` | 工具函数 |
| `src/stores/` | Zustand 全局状态 |
| `src/types/` | 共享 TypeScript 类型，与后端 DTO 对齐 |
| `tests/` | Vitest 单元 + Playwright E2E |

## 关键约定

- **数据获取**：Server Components 优先 `fetch` + RSC；客户端交互用 TanStack Query。
- **PDF 渲染**：`react-pdf`（基于 pdf.js）。
- **流式回复**：AI 回复走 SSE（`text/event-stream`），通过 backend 转发 ai-service 的流。
- **状态管理**：Zustand 管理全局 UI 状态，TanStack Query 管理服务端状态。
- **认证**：JWT 在 httpOnly cookie，前端不读写 token。

## API 客户端规范

所有后端调用必须经 `src/lib/api/client.ts` 的 `apiFetch` 封装，不得散落裸 `fetch`：

```typescript
// src/lib/api/client.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> { ... }
```

## 文件命名

- 组件文件：`PascalCase.tsx`（如 `PaperCard.tsx`）。
- 工具/hook/api 文件：`camelCase.ts` 或 `kebab-case.ts`。
- 常量：`UPPER_SNAKE_CASE`。

## 测试

- 核心组件必须有 Vitest 单元测试。
- 关键用户流程（登录、上传、Chat、Review 生成）必须有 Playwright E2E。
