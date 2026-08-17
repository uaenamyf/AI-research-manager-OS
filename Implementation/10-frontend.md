# 10 - 前端实现（Next.js）

> **实现状态**：API 客户端层、类型定义、布局/业务组件、7 Feature 页面骨架均已生成。工程配置文件（package.json/tailwind.config/next.config 等）待用脚手架初始化。

## 目录结构

```
frontend/
├── src/
│   ├── app/                      # App Router
│   │   ├── (auth)/login          # 路由组（不显示布局）
│   │   ├── (auth)/register
│   │   ├── dashboard/
│   │   ├── library/              # F2/F3 项目 + 论文库（上传/文件夹/删除）
│   │   ├── papers/[id]/          # Paper Workspace（PDF + Paper Card）
│   │   ├── literature/           # 文献检索（MCP 学术搜索）
│   │   ├── assistant/            # 写作助手
│   │   ├── writing/              # Review Generator + 手稿工作区
│   │   └── settings/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 组件
│   │   ├── paper/
│   │   │   ├── PdfViewer.tsx
│   │   │   ├── PaperCard.tsx
│   │   │   └── PaperUploader.tsx
│   │   ├── upload/               # 全局上传进度面板
│   │   └── layout/
│   ├── lib/
│   │   ├── api/                 # 后端 API 客户端（封装 fetch）
│   │   │   ├── client.ts         # 带拦截器的 baseURL 客户端
│   │   │   ├── papers.ts
│   │   │   ├── projects.ts
│   │   │   └── literature.ts
│   │   ├── hooks/
│   │   └── utils/
│   ├── stores/                   # Zustand 状态
│   └── types/                    # 共享类型（与后端 DTO 对齐）
├── public/
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

## 关键约定

- **数据获取**：Server Components 优先用 fetch + RSC；客户端交互用 TanStack Query。
- **PDF 渲染**：`react-pdf`（基于 pdf.js），支持选中文本高亮。
- **聊天流式**：AI 回复用 Server-Sent Events（SSE），通过 backend 转发 ai-service 的流。
- **认证**：JWT 存 httpOnly cookie，客户端不暴露 token。

## 核心 API 客户端示例

```typescript
// src/lib/api/client.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}
```

## 已实现文件清单

### 类型层 `src/types/`
- `index.ts` - 全部 API 契约类型（User/Project/Paper/Chat/Review/ApiResponse/Page）

### API 客户端层 `src/lib/api/`
- `client.ts` - 统一 apiFetch 封装（cookie + 统一响应解析 + ApiError）
- `auth.ts` - F1 认证（register/login/logout/getCurrentUser/Google OAuth URL）
- `projects.ts` - F2 Project 列表
- `papers.ts` - F3/F4 论文上传（presigned POST 三步）/详情/列表/状态轮询/删除
- `literature.ts` - 文献检索（MCP）
- `reviews.ts` - F7 Review 生成（异步 + 轮询）

### Hooks `src/lib/hooks/`
- `usePaperStatus.ts` - 论文分析状态轮询
- `useChatStream.ts` - 流式聊天状态管理 + 取消

### 状态管理 `src/stores/`
- `ui.ts` - 侧边栏开合、当前项目
- `auth.ts` - 当前登录用户

### 布局组件 `src/components/layout/`
- `AppShell.tsx` - 侧边栏 + 主内容区外壳
- `Sidebar.tsx` - 侧边导航
- `Header.tsx` - 顶栏（侧边栏开关 + 用户信息）

### 业务组件 `src/components/paper/`
- `PaperCard.tsx` - Paper Intelligence Card 展示
- `CardField.tsx` - Card 字段
- `PaperStatusBadge.tsx` - 论文状态徽章
- `PaperUploader.tsx` - PDF 上传（presigned POST 三步）
- `PdfViewer.tsx` - PDF 阅读器（react-pdf 占位）

### 基础 UI `src/components/ui/`
- `index.tsx` - Button/Input/Card/Spinner/Badge（shadcn 风格轻量实现）

### 页面 `src/app/`
- `layout.tsx` + `globals.css` - 根布局
- `page.tsx` - 根页面重定向到 dashboard
- `(auth)/login/page.tsx` - F1 登录
- `(auth)/register/page.tsx` - F1 注册
- `dashboard/page.tsx` - 仪表盘（项目/论文/统计）
- `library/page.tsx` - F2/F3 论文库（项目列表 + 论文上传）
- `assistant/page.tsx` - AI 问答助手
- `papers/[id]/page.tsx` - F4 Paper Workspace（PDF + Card 双栏）
- `writing/page.tsx` - F7 Review Generator（选论文 + 生成）
- `settings/page.tsx` - 账户 + 订阅档位

## 待办（工程配置）

以下文件需用 `create-next-app` 或手动初始化后补全：
- `package.json`（依赖：next/react/zustand/@tanstack/react-query/react-pdf）
- `tsconfig.json`（配置 `@/*` 路径别名）
- `tailwind.config.ts` + `postcss.config.js`
- `next.config.ts`
- `.eslintrc.json` + `.gitignore`
- `components.json`（shadcn/ui 配置，可选）
