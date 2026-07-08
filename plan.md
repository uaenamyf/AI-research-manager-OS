# AI Research Student OS 总体规划

> 面向海外研究生与科研人员的 **AI 科研工作台**：帮助用户快速读懂论文、管理文献、基于个人文献库智能问答，并辅助生成 Literature Review。
>
> 一句话定位：
> **ResearchOS AI is an AI-powered research workspace that transforms scattered papers into an interactive knowledge base, helping researchers read faster, think deeper, and write better.**

本文整合自三份原始文档：完整工程方案、MVP 介绍、简版 PRD。已去除重复内容，按"产品 → 用户 → 功能 → 架构 → 工程 → 计划 → 商业"逻辑重新组织。

---

## 目录

1. [产品定位与切入点](#1-产品定位与切入点)
2. [用户画像与痛点](#2-用户画像与痛点)
3. [产品目标与成功指标](#3-产品目标与成功指标)
4. [MVP 功能范围（P0/P1）](#4-mvp-功能范围p0p1)
5. [用户流程](#5-用户流程)
6. [页面设计](#6-页面设计)
7. [总体技术架构](#7-总体技术架构)
8. [技术选型总览](#8-技术选型总览)
9. [前端设计（Next.js）](#9-前端设计nextjs)
10. [Java Backend 设计](#10-java-backend-设计)
11. [Python AI Service 设计](#11-python-ai-service-设计)
12. [核心 AI Agent 设计](#12-核心-ai-agent-设计)
13. [RAG 系统设计](#13-rag-系统设计)
14. [服务通信设计](#14-服务通信设计)
15. [非功能需求与安全设计](#15-非功能需求与安全设计)
16. [部署方案](#16-部署方案)
17. [开发计划与路线](#17-开发计划与路线)
18. [商业化设计](#18-商业化设计)
19. [MVP 明确不做的事项](#19-mvp-明确不做的事项)
20. [后续版本规划](#20-后续版本规划)

---

# 1. 产品定位与切入点

## 产品名称（暂定）

**ResearchOS AI**

## 产品定位

传统科研流程割裂：

```
Google Scholar → 下载PDF → Zotero管理 → Notion记录 → ChatGPT提问 → Word写作
```

存在问题：
- 文献管理工具与 AI 分离；
- 阅读论文耗时；
- 看完论文容易遗忘；
- 难以发现研究空白；
- Literature Review 编写困难。

ResearchOS 整合流程：

```
论文上传 → AI 理解论文 → 形成个人知识库 → 基于论文库问答 → 辅助写作
```

## 最佳切入版本（建议）

不要做泛化的 "AI Research Assistant"，而是聚焦：

> **AI Research OS for Biology & Environmental Scientists**

第一批用户：Ecology PhD、Biology researchers、Conservation scientists。

论文理解中加入：Species extraction、Method extraction、Dataset extraction、Research gap detection。

这样竞争对手不是 ChatGPT，而是"一个懂生物科研流程的 AI 助手"。

---

# 2. 用户画像与痛点

## 核心用户

| 用户 | 需求 |
| --- | --- |
| 硕士研究生 | 快速理解大量论文 |
| 博士研究生 | 管理研究方向和文献 |
| Postdoc | 整理研究资料、写综述 |
| 青年科研人员 | 提高论文写作效率 |

## 用户痛点（5 条）

1. 文献管理工具和 AI 分离；
2. 阅读论文耗时；
3. 看完论文容易遗忘；
4. 难以发现研究空白；
5. Literature Review 编写困难。

---

# 3. 产品目标与成功指标

## MVP 目标

验证：

> 用户是否愿意使用 AI 管理自己的科研知识，并为此付费。

## 成功指标（3 个月）

### 用户指标
- 注册用户：1000+
- 活跃用户：200+
- 付费用户：20+

### 产品指标
- 用户上传论文 ≥ 10 篇
- AI 问答次数 ≥ 20 次/用户
- Literature Review 生成次数 ≥ 5 次/用户

---

# 4. MVP 功能范围（P0/P1）

合并 MVP 介绍的 5 个 Feature 与 PRD 的 7 个 Feature，按优先级统一编号。

## Feature 1：用户账户系统（P0）

用户注册并创建个人科研空间。

- 注册方式：Email、Google OAuth
- 用户空间包含：Projects、Papers、Knowledge

## Feature 2：Research Project 管理（P0）

用户以研究课题为单位管理论文。

- 创建：项目名称、研究领域、简介

示例：

```
Project: Deep Learning for Animal Vocal Recognition
Papers: paper1.pdf, paper2.pdf
```

## Feature 3：论文上传与管理（P0，核心入口）

- 支持：单篇 / 多篇 PDF 上传
- 自动提取：Title、Author、Year、DOI、Abstract、Keywords

状态流转：

```
Uploaded → Processing → Analyzed → Ready
```

## Feature 4：AI Paper Intelligence Card（P0，核心功能）

AI 自动理解论文，替代约 30 分钟人工阅读。

**Basic Information**：Title、Author、Year、Journal

**Research Summary**：

```
Research Question:  作者试图解决什么问题？
Method:            使用什么方法？
Dataset:           数据集
Main Findings:     主要发现
Innovation:        创新在哪里？
Limitation:        不足
Future Direction:  未来方向
```

## Feature 5：AI Paper Chat（P0）

用户针对论文提问，基于论文内容（RAG）回答。

支持：方法解释、图表解释、实验分析、找 limitations。

示例：

```
PDF Viewer | AI Assistant
            Ask: Why did authors use CNN?
```

## Feature 6：Personal Research Knowledge Base（P1）

构建用户个人科研知识库。第一版不做复杂 3D 知识图谱，只做**标签 + 关联搜索**。

- 自动生成 Tags（如 Deep Learning、Bioacoustics、Animal Behavior）
- 支持搜索："Find papers related to individual recognition"

## Feature 7：Literature Review Assistant（P1，付费点）

辅助生成综述，最容易收费的功能。

- 输入：选择 N 篇论文 + Topic
- 输出：Markdown 综述（Introduction / Previous studies / Current limitations / Future directions）
- 自动插入 Citation

---

# 5. 用户流程

```
注册账号
  ↓
创建 Research Project
  ↓
上传论文
  ↓
AI 分析论文（Processing）
  ↓
查看 Paper Intelligence Card
  ↓
向 AI 提问（Paper Chat）
  ↓
加入 Knowledge Base
  ↓
Generate Literature Review
  ↓
订阅 Pro
```

---

# 6. 页面设计

## Dashboard

类似 Notion + Obsidian，展示：

```
My Research
Project: Animal Communication
Papers: 324
Knowledge Nodes: 1520
Writing Progress: Chapter 2 ███████░░
```

完整 Dashboard 展示：Projects、Recent Papers、AI Tasks、Writing Progress。

## Paper Workspace（论文阅读核心）

```
-------------------------------------------------
PDF Viewer              AI Assistant
Figure 1                Explain this method
Methods                 Summarize
Discussion              Find limitation
-------------------------------------------------
```

## Research Chat

基于用户论文库的问答（非普通聊天）：

```
Q: What are the limitations of current methods?
AI: Based on 23 papers:
    1... 2... 3...
Citation: Smith et al. 2025
```

## Knowledge

```
My Research Knowledge
Tags / Papers / Concepts
```

## Review Generator

```
Select papers → Input topic → Generate Review
```

---

# 7. 总体技术架构

前后端分离 + AI 微服务：

```
                         User
                          |
                 Next.js Web Application
                          |
                    HTTPS / REST API
                          |
                 Spring Boot Backend
                          |
   ------------------------------------------------
   |                    |                         |
 PostgreSQL              Redis                Object Storage
 (业务数据)            (缓存/队列)             (PDF文件)
                          |
                   AI Task Dispatcher (RabbitMQ)
                          ↓
              Python AI Platform
   --------------------------------
   |              |               |
 Paper Agent   RAG Engine   Writing Agent
   |              |               |
   --------------------------------
                |
          LLM Provider (GPT / Claude / Gemini)
                |
          Vector Database (pgvector)
```

---

# 8. 技术选型总览

| 模块 | 技术 | 原因 |
| --- | --- | --- |
| 前端 | Next.js 15 + TypeScript | AI SaaS 最佳生态 |
| UI | Tailwind CSS + shadcn/ui | 快速开发 |
| 后端 | Spring Boot 3.x + Java 21 | 企业级稳定，长期维护 |
| ORM | MyBatis Plus / JPA | 数据库操作 |
| 数据库 | PostgreSQL | 可靠 |
| 向量库 | pgvector | 简单统一 |
| 缓存 | Redis | Session + 任务 |
| 文件存储 | AWS S3 / Cloudflare R2 | 论文 PDF |
| AI 服务 | Python 3.12 + FastAPI | AI 生态 |
| Agent | LangGraph | 复杂工作流 |
| RAG | LlamaIndex / LangChain | 文献检索 |
| 异步任务 | RabbitMQ | 任务解耦 |
| LLM | GPT-5 / Claude | 智能能力 |
| 部署 | Docker + Kubernetes | 扩展 |

### 为什么不用 Vue？

AI SaaS 领域 React 生态更丰富、AI 组件更多、海外招聘更容易，故选 Next.js + TypeScript。

---

# 9. 前端设计（Next.js）

## 页面结构

```
src/app
├── dashboard
├── projects
├── papers
├── knowledge-map
├── writing
├── chat
└── settings
```

---

# 10. Java Backend 设计

## 后端模块结构

```
backend
├── user
├── auth
├── project
├── paper
├── file
├── ai-task
├── chat
└── subscription
```

## 核心数据库设计

### User

```
user
  id
  email
  password
  plan
  created_time
```

### Project

```
research_project
  id
  user_id
  name
  description
  domain
```

### Paper

```
paper
  id
  project_id
  title
  authors
  year
  doi
  pdf_url
  summary
  status
```

### Paper Chunk

```
paper_chunk
  id
  paper_id
  content
  embedding  vector(1536)
  section
```

### Chat History

```
conversation
  id
  user_id
  paper_id
  question
  answer
```

### AI Task

```
ai_task
  task_id
  user_id
  type
  status   (PENDING / PROCESSING / SUCCESS / FAILED)
  result
  created_time
```

---

# 11. Python AI Service 设计

使用 FastAPI。

```
ai-service
└── app
    ├── api
    ├── agents
    │   ├── paper_agent.py
    │   ├── chat_agent.py
    │   ├── review_agent.py
    │   └── writing_agent.py
    ├── rag
    │   ├── retriever.py
    │   ├── vector_store.py
    │   └── embedding.py
    ├── parser
    │   └── pdf_parser.py
    └── llm
        └── client.py
```

---

# 12. 核心 AI Agent 设计

## Agent 1：Paper Understanding Agent

输入 PDF，流程：

```
PDF → Parser → Section Extraction → Embedding → Knowledge Extraction → Summary
```

输出 JSON：

```json
{
  "title": "",
  "method": "",
  "finding": "",
  "limitation": "",
  "future_work": ""
}
```

## Agent 2：Literature Review Agent（收费核心）

流程：

```
User: Generate review about topic
  → Retriever → Select papers → Compare methods
  → Identify gap → Generate review → Citation insertion
```

输出 Markdown：

```
Previous studies have mainly focused on...
However...
Recent studies suggest...
```

## Agent 3：Research Idea Agent（高级功能）

输入用户研究方向，输出：

```
Research gap: 1. 2.
Possible hypothesis:
Experiment design:
Expected contribution:
```

## Agent 4：Writing Agent（科研版 Cursor）

功能：改写、润色、回复审稿人、Cover letter。

---

# 13. RAG 系统设计

## 文献切分

不要简单按 token，按论文结构分别 embedding：

```
Abstract / Introduction / Methods / Results / Discussion / References
```

## PaperChunk 结构

```
paper_chunk
  id
  paper_id
  section
  content
  embedding  vector(1536)
```

## 检索示例

用户："What methods were used for individual recognition?"

检索策略：优先 Methods section，然后 LLM 生成。

---

# 14. 服务通信设计

## 同步任务（如问答）

```
Frontend → Java → Python API → LLM → Return
```

## 异步任务（如批量上传论文）

```
Java → RabbitMQ → Python Worker → Parse → Embedding → Save
```

---

# 15. 非功能需求与安全设计

## 性能目标

- PDF 上传 < 10MB
- AI 总结 < 60 秒
- Chat 响应 < 10 秒

## 安全要求

科研论文很多未发表，必须严格隔离：

### 数据隔离

所有查询必须带 user_id，层级隔离：

```
user_id → project → paper
```

### 文件安全

- PDF 私有 bucket
- Signed URL 访问
- 不用于模型训练

---

# 16. 部署方案

## 开发环境

Docker Compose：

```yaml
services:
  frontend
  backend
  ai-service
  postgres
  redis
  rabbitmq
```

## 云部署

推荐 AWS：

```
EC2 + RDS PostgreSQL + S3 + CloudFront
```

或更便宜的：

```
DigitalOcean + Cloudflare R2
```

---

# 17. 开发计划与路线

合并三种粒度的计划（Phase / 周计划 / Sprint），统一为 Sprint 视图。

一个开发者预计 **8–12 周**完成 MVP。

## Sprint 1（2 周）— 基础平台

- 登录 / 用户系统
- Research Project 创建
- PDF 上传
- 文件存储（S3/R2）

## Sprint 2（3 周）— AI 核心能力

- PDF 解析
- AI Summary（Paper Intelligence Card）
- Paper Chat
- RAG

## Sprint 3（3 周）— 商业化能力

- Literature Review Assistant
- Subscription 订阅
- Knowledge Base
- Dashboard 优化、UI 优化

## 更长期路线（参考）

| 阶段 | 周期 | 内容 |
| --- | --- | --- |
| Phase 1 | 4 周 | 用户系统、上传 PDF、AI 总结、Paper Chat、文献库 |
| Phase 2 | 8 周 | RAG、Citation、Knowledge Graph、Literature Review |
| Phase 3 | 3–6 个月 | Stripe 支付、Team workspace、Lab 版本、Zotero 同步 |

---

# 18. 商业化设计

| 档位 | 价格 | 额度 |
| --- | --- | --- |
| 免费 | $0 | 10 papers / month |
| Pro | $9.99/month | 500 papers、Unlimited AI chat、Review generation |
| Researcher | $29/month | Unlimited、Advanced writing |

---

# 19. MVP 明确不做的事项

避免拖死项目：

- ❌ 自动实验设计
- ❌ 自动写完整论文
- ❌ 复杂知识图谱
- ❌ 本地模型部署
- ❌ 多 Agent 协作系统
- ❌ 移动 App

---

# 20. 后续版本规划

## V2

- Zotero 同步
- Chrome 插件
- Citation Manager
- Knowledge Graph

## V3

- AI Research Agent
- Experiment Design
- Grant Proposal Assistant
- Lab Collaboration

---

> 架构可自然扩展成完整 Research OS。本文档可作为融资 / 找合伙人的基础，后续可继续扩展为正式商业 PRD。
