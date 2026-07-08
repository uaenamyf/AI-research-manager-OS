# 10 - 前端实现（Next.js）

## 目录结构

```
frontend/
├── src/
│   ├── app/                      # App Router
│   │   ├── (auth)/login          # 路由组（不显示布局）
│   │   ├── (auth)/register
│   │   ├── dashboard/
│   │   ├── projects/[id]/
│   │   ├── papers/[id]/          # Paper Workspace
│   │   │   ├── page.tsx          # PDF + AI 助手双栏
│   │   │   └── chat/             # Paper Chat
│   │   ├── knowledge/
│   │   ├── writing/              # Review Generator
│   │   └── settings/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 组件
│   │   ├── paper/
│   │   │   ├── PdfViewer.tsx
│   │   │   ├── PaperCard.tsx
│   │   │   └── ChatPanel.tsx
│   │   └── layout/
│   ├── lib/
│   │   ├── api/                 # 后端 API 客户端（封装 fetch）
│   │   │   ├── client.ts         # 带拦截器的 baseURL 客户端
│   │   │   ├── papers.ts
│   │   │   └── chat.ts
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
