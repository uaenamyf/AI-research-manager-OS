# 00 - 总览：仓库结构与技术栈

## 仓库结构（monorepo）

```
ai-research-os/
├── frontend/                 # Next.js 16 应用
├── backend/                  # Spring Boot 3 (Java 21)
├── ai-service/               # FastAPI Python 服务
├── infra/                    # docker-compose、部署脚本
│   └── docker-compose.yml
├── docs/                     # 架构文档、API 文档
├── Implementation/           # 本文件夹（实现方案，按服务拆分）
├── plan.md                   # 产品规划（只读参考）
├── CLAUDE.md                 # 项目编码规范
├── AGENTS.md                 # 多 agent 协作规范
└── README.md
```

## 服务职责边界（严格遵守）

| 服务 | 允许职责 | 禁止职责 |
| --- | --- | --- |
| frontend | UI 渲染、状态管理、调用 backend API | 直接访问数据库、直接调用 ai-service |
| backend | 业务逻辑、用户/权限/订阅、文件上传编排、任务下发 | 实现 AI/LLM 逻辑、向量计算 |
| ai-service | PDF 解析、LLM 调用、RAG、Agent 工作流 | 持久化业务数据（结果回传 backend） |

> **铁律**：frontend 只与 backend 通信；backend 通过 RabbitMQ/HTTP 与 ai-service 通信；frontend 永远不直连 ai-service。

## 技术栈与版本锁定

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 前端 | Next.js + React | 16.x |
| 前端语言 | TypeScript | 5.x |
| UI | Tailwind CSS + shadcn/ui | latest |
| 后端 | Spring Boot | 3.3.x |
| 后端语言 | Java | 21 LTS |
| ORM | MyBatis-Plus | 3.5.x |
| 安全 | Spring Security + JWT | 6.x |
| 数据库（业务） | MySQL | 8.x |
| 向量库（AI） | PostgreSQL + pgvector 扩展 | 16 / 0.7.x |
| 缓存 | Redis | 7.x |
| 消息队列 | RabbitMQ | 3.13 |
| AI 服务 | Python + FastAPI | 3.12 / 0.115 |
| Agent | LangGraph | 0.2.x |
| RAG | LlamaIndex | 0.11.x |
| PDF 解析 | PyMuPDF + GROBID（可选） | latest |
| LLM SDK | OpenAI SDK / Anthropic SDK | latest |
| 对象存储 | AWS S3 SDK v2 / Cloudflare R2 | - |

## Feature -> 模块映射

| Feature | 前端模块 | 后端模块 | ai-service 模块 |
| --- | --- | --- | --- |
| F1 用户账户 | `app/(auth)` | `user`、`auth` | - |
| F2 Project | `app/library` | `project` | - |
| F3 论文上传 | `app/library` | `paper`、`file` | `parser/pdf_parser.py` |
| F4 Paper Card | `app/papers/[id]` | `paper` | `agents/paper_agent.py` |
| F7 Review Assistant | `app/writing` | `ai-task` | `agents/review_agent.py` |
