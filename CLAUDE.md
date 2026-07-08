# CLAUDE.md - ResearchOS AI 项目规范

> 本文件是 Claude Code 在本仓库工作时的**强制规范**。所有代码生成、重构、提交必须遵守。
>
> 项目详见 `plan.md`（产品规划）与 `Implementation/` 文件夹（实现方案，按服务拆分，入口见 `Implementation/README.md`）。本文件只规定**怎么做**，不规定做什么。
>
> 各服务目录下有专属 `AGENTS.md`（`frontend/AGENTS.md`、`backend/AGENTS.md`、`ai-service/AGENTS.md`），规定该服务的模块约束，开发对应服务前必读。

---

## 0. 先读这个

接到任何任务前，先通读 `.claude/skills/README.md` 判断是否命中现成 skill。命中则按其 `SKILL.md` 执行，避免重复造轮子。

常用 skill：
- 前端 UI / 视觉决策 -> `frontend-design`
- 构建 claude.ai artifact -> `web-artifacts-builder`
- 构建 MCP server -> `mcp-builder`
- 测试本地 web 应用 -> `webapp-testing`

---

## 1. 仓库结构

```
ai-research-os/
├── frontend/          # Next.js 15 + TS（见 frontend/AGENTS.md）
├── backend/           # Spring Boot 3 + Java 21（见 backend/AGENTS.md）
├── ai-service/        # FastAPI + Python 3.12（见 ai-service/AGENTS.md）
├── infra/             # docker-compose、部署脚本
├── docs/              # 架构文档、API 文档
├── Implementation/    # 实现方案文件夹（README.md 为索引，按服务拆分子文档）
├── plan.md            # 产品规划
├── CLAUDE.md          # 本文件（全局编码规范）
└── AGENTS.md          # 多 agent 协作规范
```

> 每个服务目录下的 `AGENTS.md` 是该服务的模块级约束，与本文件配合使用：本文件管全局，模块 AGENTS.md 管服务内细节。

---

## 2. 服务边界（铁律）

**严禁越界**，违反即视为错误实现：

| 服务 | 允许 | 禁止 |
| --- | --- | --- |
| frontend | 只调 backend API | 直连数据库、直连 ai-service |
| backend | 业务逻辑、任务编排 | 实现 LLM/向量逻辑 |
| ai-service | PDF 解析、LLM、RAG | 持久化业务数据（结果回传 backend） |

- frontend 只通过 backend 的 REST API 获取数据。
- backend 与 ai-service 之间：同步用 HTTP（SSE 转发），异步用 RabbitMQ。
- 数据库由 backend 与 ai-service 共享，但 **ai-service 不写业务表**（paper/user/task），只写 `paper_chunk`（向量）与回传结果给 backend。

---

## 3. 文件头注释规范（Python）

> 此规则源自既定约定，适用于 `ai-service/` 下所有 `.py` 文件。

每个 Python 文件顶部**只出现一次**以下内容，顺序固定：

```python
# date: YYYY-MM-DD
# dev: <git user.name>
"""一行 intro docstring，说明本文件职责。"""
```

**禁止：**
- 文件头出现 `# changelog:`（changelog 只写在改动处正上方，见 §4）。
- 文件头出现两个 `# date` 行（一个是原始的、一个是后加的）。
- 修改文件时在顶部追加新的 `# date` + `# dev` + `# changelog`。

**无 docstring 的 `__init__.py`**：用简洁 intro docstring 替代。

**示例：**

```python
# date: 2026-07-08
# dev: myf
"""Paper Intelligence Card 生成 agent。"""
```

### Java 文件头

Java 文件使用类级 Javadoc，不使用 `# date` 风格：

```java
/**
 * Paper 服务：论文 CRUD 与分析编排。
 *
 * @author myf
 * @since 2026-07-08
 */
```

### TypeScript / 前端文件

前端文件默认不加文件头注释；必要时用简短行注释说明文件职责即可。

---

## 4. 变更注释规范

修改既有代码时，在**改动处正上方**加注释（不要堆在文件头）：

```python
# date: 2026-07-09
# dev: myf
# changelog: 增加 section 加权检索（methods ×1.5）
def retrieve_with_weight(...):
    ...
```

Java：

```java
// 2026-07-09 myf: 改用批量插入提升 chunk 写入性能
```

---

## 5. 命名规范

| 语言 | 变量/函数 | 类 | 文件 |
| --- | --- | --- | --- |
| Python | `snake_case` | `PascalCase` | `snake_case.py` |
| Java | `camelCase` | `PascalCase` | `PascalCase.java` |
| TypeScript | `camelCase`（函数/变量），`UPPER_SNAKE`（常量） | `PascalCase` | `kebab-case.tsx` |

- 数据库表名：`snake_case`（如 `research_project`、`paper_chunk`）。
- 数据库列名：`snake_case`。
- API 路径：`kebab-case`（如 `/api/papers/{id}/chat/stream`）。
- 常量/枚举：`UPPER_SNAKE`（如 `PAPER_ANALYSIS`、`PROCESSING`）。

---

## 6. 数据库规范

- 迁移用 **Flyway**，脚本放 `backend/src/main/resources/db/migration/V{n}__{desc}.sql`，版本号严格递增。
- 所有业务表必须含 `user_id`（多租户隔离）。
- 所有表必须含 `created_time TIMESTAMPTZ DEFAULT now()`。
- 向量列固定类型 `vector(1536)`（对应 `text-embedding-3-small`），如换 embedding 模型需同步改维度并重建索引。
- 向量检索索引用 `ivfflat`，`lists = 100`（小数据集可调）。
- JSONB 字段（如 `paper.summary`）用于结构化但可能扩展的字段。

---

## 7. 安全与多租户（强制）

- 所有 service 层查询方法签名必须包含 `userId` 参数，SQL 必须带 `WHERE user_id = ?`。
- 禁止出现「按 id 查询但不校验归属」的接口。
- PDF 文件走 S3/R2 私有 bucket + Signed URL（15min 有效）。
- 上传用 Pre-signed POST 直传，backend 不中转文件流。
- ai-service 只接受 backend 调用，用 `X-Internal-Token` 校验。
- 用户密码用 BCrypt；JWT secret 从环境变量读取，不硬编码。

---

## 8. API 规范

- backend 对外统一前缀 `/api`。
- 统一响应体：`{ code, message, data }`，`code=0` 表示成功。
- 分页参数统一 `?page=0&size=20`，响应当前页、总条数、总页数。
- 错误码：业务错误用 4xx，系统错误用 5xx，错误体含 `code` + `message`。
- 流式接口（Chat）用 SSE（`text/event-stream`）。

---

## 9. 异步任务规范

- RabbitMQ exchange：`researchos.ai.task`（direct）。
- routing key：`paper.analyze` / `review.generate`。
- 消息体 JSON：`{ taskId, type, payload }`。
- 消费失败重试 3 次（指数退避），超限进 DLQ，backend 监听 DLQ 标记 `FAILED`。
- 任务状态机：`PENDING -> PROCESSING -> SUCCESS / FAILED`。

---

## 10. 代码质量

- 不留 TODO 不跟踪；所有 TODO 必须附 issue 号或日期。
- 禁止提交 `console.log` / `print` 调试语句到主分支。
- 函数单职责，超过 80 行考虑拆分。
- 新增依赖必须在 `Implementation/00-overview.md` 技术栈表更新并说明原因。

---

## 11. 提交规范

Conventional Commits：

```
<type>(<scope>): <subject>

type:  feat | fix | docs | style | refactor | test | chore | build | ci
scope: frontend | backend | ai-service | infra | docs
```

示例：

```
feat(ai-service): 实现 section-aware PDF 切分
fix(backend): 修复 paper 查询未校验 user_id 的越权问题
docs: 更新 IMPLEMENTATION Sprint 2 任务
```

---

## 12. 测试要求

- 后端：service 必须有单元测试；controller 用 MockMvc；集成测试用 Testcontainers。
- ai-service：LLM 调用必须可 mock，CI 不消耗真实 token；用 fixture 固化 PDF 解析结果。
- 前端：核心组件用 Vitest；关键流程用 Playwright E2E。
- 新增功能 PR 必须带对应测试，否则不予合并。

---

## 13. 依赖与环境

- 密钥、token 一律走环境变量，禁止入库。`.env` 文件加入 `.gitignore`。
- `INTERNAL_TOKEN`（backend <-> ai-service）两端必须一致。
- 本地开发统一用 `infra/docker-compose.yml` 起 PG/Redis/Rabbit。
- Python 用 3.12，虚拟环境隔离（venv 或 poetry）。

---

## 14. 常见违规清单（自检）

写完代码后对照检查：

- [ ] Python 文件头是否只有 `# date` + `# dev` + docstring，没有 `# changelog`？
- [ ] 是否有文件头出现两个 `# date`？
- [ ] service 查询是否都带了 `user_id` 过滤？
- [ ] frontend 是否绕过 backend 直连了 ai-service 或数据库？
- [ ] ai-service 是否直接写了业务表（paper/user/task）？
- [ ] 新增依赖是否更新了 `Implementation/00-overview.md` 技术栈表？
- [ ] 敏感信息是否硬编码？
- [ ] changelog 是否写在了文件头而不是改动处上方？

---

> 规范会随项目演进更新。修改本文件需同步通知所有协作者。
