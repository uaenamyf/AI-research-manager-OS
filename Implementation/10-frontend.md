# 10 - 前端实现（Next.js）

## 融合现状（2026-08-18）

> **本小节描述融合后的实际状态（以此为准）。下方原 Next.js 内容为 legacy 参考（该工程已下线，仅作历史参考）。**

### 浏览器单一入口：DSH GUI（:3080）

- **Next.js 前端（:3000）已下线**：2026-08-18 执行 `docker compose --profile app stop frontend`，`:3000` 连接拒绝（容器 Stopped）。
- **回退**：`docker compose --profile app start frontend` 可随时恢复（回退命令保留，未执行）。
- **浏览器单一入口改为 DSH GUI**：`http://127.0.0.1:3080`（DSH 单实例，`dsh-plugins/scripts/dsh-gateway.sh` 启动，自动注入 `.env` 的 LLM key/模型 + `JWT_SECRET` + MySQL/RabbitMQ/Stripe env + `RESEARCH_GATEWAY_URL=http://127.0.0.1:3080`）。
- 原 Next.js 页面功能已由 **11 个 `ui-research-*` 客户端包**覆盖（覆盖矩阵见根 `plan.md`「Phase 4 出口」）。

### ui-research-\* 客户端包清单（11 个）

客户端 UI 包 = 聊天节点 / 关键词触发面板，经 DSH `ConversationNodeDefinition` 体系接入浏览器 GUI 会话流：

| 包 | 形态 | 触发方式 |
| --- | --- | --- |
| `ui-research-hello` | 最小探针（sidebar 底部面板） | 常驻显示（无需触发） |
| `ui-research-library` | 文献库富卡片聊天节点 | 标准 tool 事件匹配：`literature_search`（MCP 工具） |
| `ui-research-paper` | Paper Intelligence Card 聊天节点 | 标准 tool 事件匹配：`literature_get` |
| `ui-research-citation` | 引用卡片聊天节点（BibTeX/RIS + 复制按钮） | 标准 tool 事件匹配：`literature_cite` |
| `ui-research-dashboard` | 统计面板节点（自取数） | 用户消息关键词：dashboard / 仪表盘 / 统计 / stats |
| `ui-research-writing` | 写作面板节点（6 动作改写） | 用户消息关键词：写作 / 改写 / 润色 / 扩写 / 缩写 / 翻译 / 审稿 / cover letter 等 |
| `ui-research-settings` | 设置面板节点（LLM/翻译/Knowledge 三段表单） | 用户消息关键词：设置 / settings / 配置 / config |
| `ui-research-literature` | 文献检索面板节点（查询词预填） | 用户消息关键词：文献检索 / 搜文献 / 检索文献 / literature / search paper |
| `ui-research-review` | 综述生成面板节点（主题 + 选论文 + 轮询） | 用户消息关键词：综述 / 文献综述 / review |
| `ui-research-upload` | 上传面板节点（三步上传） | 用户消息关键词：上传 / upload / 上传文献 / 上传论文 |
| `ui-research-project` | 项目/文件夹树管理面板节点 | 用户消息关键词：项目 / 项目管理 / 文件夹 / 目录 |

> 工具类节点（library/paper/citation）按 MCP 文献工具分流渲染；面板类节点（dashboard/writing/settings/literature/review/upload/project）按用户消息关键词触发。`ui-research-assistant` 由 DSH 会话天然承担，无需专门页面。

### boot 清单 49 条目机制（out-of-tree 客户端包注入）

- 客户端 UI 包是 **out-of-tree 包**（`dsh-plugins/ui-research-*`，不进 DSH 官方仓库）：`package.json` 声明 `dsh.client`（`{platform:"web"}`）+ `exports["./client"]` → `lib/client.js`（浏览器 half，`window.__ModuleLoader__.load` 格式）+ `lib/index.js`（node half，空 apply）。
- `dsh plugin add` + 重启后，`dsh-client-modules` 自动扫描 → **boot 清单注入新条目**（当前 **49 条目**，含 11 个 research UI 包）：`@researchos/ui-* → /plugins/<id>/client.js?rev=...`。
- 浏览器 GUI 启动时按清单加载 `/plugins/<id>/client.js`（content-type `text/javascript`，rev 命中 200）→ 节点自动注册。
- **关键结论：out-of-tree 客户端包注入无需重建 web app**，`dsh plugin add` + 重启即被 GUI 加载；卸载即移除（可拔插）。

> 注：以下为 legacy 描述（Next.js 工程已下线，仅作历史参考，不再维护）。

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
