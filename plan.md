# ResearchOS AI 发展路线图：文献管理器 + AI 写作助手

> 本文档是 `plan.md` 的**增强执行版**：在既有 MVP 基础上，把产品从「AI 论文阅读工具」升级为
> **真正的文献管理器 + AI 写作助手**。旧版总体规划内容保留在 git 历史（`git show HEAD:plan.md`）。
>
> 配套：`AGENTS.md`（协作规范）、`CLAUDE.md`（编码规范）、`Implementation/`（契约与实现方案）。

---

## 1. 定位与目标

一句话定位：

> **ResearchOS AI = 个人文献库（Zotero 式管理）× AI 理解（RAG）× 写作闭环（引用注入 + 改写）**

三个支柱：

| 支柱 | 目标 | 对标 |
| --- | --- | --- |
| 管理 | 发现→导入→组织→阅读 全流程，元数据权威可靠 | Zotero / Paperpile / Mendeley |
| 理解 | 论文问答 / 综述 / 标签图谱（已具备，持续增强） | Elicit / SciSpace |
| 写作 | 引用插入、自动参考文献、段落级相关文献推荐 | Scite / Cursor 式写作流 |

## 2. 现状基线（2026-08-15）

已具备：PDF 上传/解析、Paper Card、RAG 问答（流式+非流式）、综述生成、写作改写（polish/translate/rebuttal/cover letter）、
文件夹、知识标签/图谱、MCP 七源文献检索、JWT 认证、额度订阅、双库（MySQL+PG 向量）、CI/CD、删除论文跨库清理。

## 3. 差距分析（本次路线图要补的）

### 3.1 管理侧
- ❌ 权威元数据补全（DOI → Crossref/OpenAlex）  ❌ 检索结果一键入库  ❌ BibTeX/RIS 导入导出
- ❌ 引用格式导出（APA/MLA/GB-T 7714）  ❌ 全文搜索（pg_trgm）  ❌ 阅读状态机/保存搜索  ❌ 去重

### 3.2 阅读侧
- ❌ PDF 批注/高亮 + 笔记（高亮进知识库可被 RAG 检索）  ❌ 目录大纲/全文内搜索

### 3.3 写作侧
- ❌ 写作区引用插入 + 自动参考文献  ❌ 段落级相关文献推荐  ❌ 大纲→分节写作闭环  ❌ 引用真实性检查  ❌ 导出 .docx/LaTeX

## 4. 阶段执行计划

> 每个任务标注服务归属（frontend / backend / ai-service / infra / docs），遵循三服务契约规范：
> 契约变更先改 `Implementation/` 文档，双方同步实现，补测试。

### Phase 1：文献导入闭环（P0，进行中 🚧）

打通「检索 → 一键入库 → AI 分析」：

| # | 任务 | 服务 | 验收 |
| --- | --- | --- | --- |
| 1.1 | 论文导入 API：`POST /api/projects/{id}/papers/import`，支持 DOI/标题/作者/年份/pdfUrl；DOI 存在时经 Crossref 补全权威元数据；有 PDF 直链则发 MQ 触发分析，否则元数据入库（状态 UPLOADED） | backend | curl 验证 + 单测 |
| 1.2 | 检索结果一键导入：Literature 页每条结果加 Import，选择项目后入库并提示 | frontend | 页面操作可用 |
| 1.3 | 契约文档（50-api-contracts）+ 里程碑勾选 + 测试 | docs | 文档同步 |

### Phase 2：写作引用与参考文献（P0）

| # | 任务 | 服务 | 验收 |
| --- | --- | --- | --- |
| 2.1 | 引用格式渲染服务（APA/MLA/GB-T 7714，由文献元数据生成 citation） | backend | 单测 |
| 2.2 | 写作编辑器引入 TipTap，支持 `[@关键词]` 触发个人库检索并插入引用 | frontend | 页面可用 |
| 2.3 | 自动参考文献列表：按引用顺序生成，可复制/导出 | frontend | 页面可用 |
| 2.4 | 段落级相关文献推荐：选中段落后检索"支持/反驳"文献（复用 RAG） | ai-service + frontend | 联调 |

### Phase 3：批注 / 高亮 / 笔记（P0）

| # | 任务 | 服务 | 验收 |
| --- | --- | --- | --- |
| 3.1 | annotation / note 表 + API（PDF key/页码/选区坐标/文本/笔记内容） | backend | 单测 |
| 3.2 | react-pdf 覆盖层实现高亮/批注，随滚动渲染 | frontend | 页面可用 |
| 3.3 | 高亮文本写入可检索索引，RAG 命中高亮内容 | ai-service | 检索命中 |

### Phase 4：BibTeX / RIS 导入导出（P0，工程量最小）

| # | 任务 | 服务 | 验收 |
| --- | --- | --- | --- |
| 4.1 | BibTeX 解析器（无 PDF 元数据入库，pdf_url 置空） | backend | 单测 + 样例 |
| 4.2 | RIS 导入导出 + BibTeX 导出（含 citation key） | backend | 单测 |
| 4.3 | 前端导入/导出入口 | frontend | 页面可用 |

### Phase 5：阅读与管理增强（P1）

- 全文搜索：PG `pg_trgm` 索引 + 前端搜索框（backend）
- 阅读状态机（to-read/reading/done + 星级）与筛选（backend + frontend）
- 保存搜索 / 智能文件夹（动态视图）（backend + frontend）
- 去重检测：同 DOI/标题归一化合并（backend）

### Phase 6：平台能力（P2）

- 浏览器插件：Google Scholar/arXiv 页面一键抓取入库（infra/frontend）
- 写作导出 .docx / LaTeX / Overleaf 同步（frontend）
- 引用真实性检查（ai-service 新 agent）
- 共享库 / 团队协作（远期）

## 5. 契约影响（Phase 1 起记录）

| 变更 | 契约文档 | 状态 |
| --- | --- | --- |
| `POST /api/projects/{id}/papers/import` | 50-api-contracts.md | 🚧 1.3 更新 |

## 6. 里程碑跟踪

- [x] 2026-08-15 修复：paper.delete 向量清理、Chat 非流式、compose env、PDF Blob 加载
- [x] Phase 1 文献导入闭环（Crossref 元数据补全 + 一键入库）
- [x] Phase 2 写作引用与参考文献（APA/MLA/GB-T 7714 + 段落级推荐）
- [x] Phase 3 批注/高亮/笔记（annotation CRUD API + 前端交互）
- [x] Phase 4 BibTeX/RIS 导出（LaTeX/Overleaf/Zotero 互操作）
- [x] Phase 5 阅读与管理增强（状态机/星级/全文搜索）
- [x] Phase 6 平台能力（BibTeX/RIS 导出 + 搜索增强）
