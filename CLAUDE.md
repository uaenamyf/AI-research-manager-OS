# CLAUDE.md - ResearchOS AI 编码规范

> 本文件是项目统一的编码规范，适用于所有服务（frontend / backend / ai-service）。
>
> - 多服务协作规则见 `AGENTS.md`（本文档的配套文档）。
> - 实现方案与契约见 `Implementation/` 文件夹。
> - 各服务目录下的 `AGENTS.md` 是该服务的模块级约束，冲突时以本文件 + 服务 AGENTS.md 为裁决依据。

---

## 目录

1. [通用规范](#1-通用规范)
2. [文件头规范](#2-文件头规范)
3. [Python 文件头规则（强制）](#3-python-文件头规则强制)
4. [Changelog 规范](#4-changelog-规范)
5. [命名规范](#5-命名规范)
6. [数据库与迁移](#6-数据库与迁移)
7. [依赖管理](#7-依赖管理)
8. [测试要求](#8-测试要求)
9. [服务边界铁律](#9-服务边界铁律)

---

# 1. 通用规范

- **语言与版本**：前端 TypeScript（Next.js 15）、后端 Java 21（Spring Boot 3.3）、AI 服务 Python 3.12（FastAPI）。
- **编码风格**：跟随语言官方风格——Java 用官方格式化（4 空格缩进），Python 用 PEP 8 + Black（4 空格），TypeScript 用 Prettier（2 空格）。
- **注释语言**：注释/文档用中文写说明，标识符用英文；对外用户可见文案一律英文（i18n 规范）。
- **禁止**：硬编码密钥/Token/连接串（必须走环境变量）；提交编译不过或测试失败的代码。

# 2. 文件头规范

| 语言 | 文件头 |
| --- | --- |
| Java | 类级 Javadoc：`@author` + `@since`（如 `@author myf` / `@since 2026-07-08`） |
| Python | 见 §3（`# date` + `# dev` + 一行 docstring） |
| TypeScript/TSX | 文件顶部可用块注释说明职责（工具类/常量文件必写，组件可不写） |

# 3. Python 文件头规则（强制）

每个 `.py` 文件顶部**只出现一次**，顺序固定：

```python
# date: 2026-07-08
# dev: myf
"""一行 intro docstring，说明本文件职责。"""
```

**禁止**：

- 文件头出现 `# changelog:`（changelog 写在改动处正上方，见 §4）。
- 文件头出现两个 `# date`。
- 修改文件时在顶部追加新的 `# date` + `# dev` + `# changelog`（改动记录写在改动处，不是文件头）。

# 4. Changelog 规范

- 改动记录写在**改动处正上方**的注释里，不追加到文件头。
- 格式（Python 示例）：

```python
# 2026-08-13 myf: 用户自定义配置失败时自动回退系统默认，避免无效配置导致功能不可用
```

- Java 中对应 `// 2026-08-12 myf: ...` 行内注释，或类 Javadoc 中说明。
- 内容：日期 + 作者 + 一句话说明「为什么改、改了什么」，不写流水账。

# 5. 命名规范

| 类型 | 规范 |
| --- | --- |
| Java 类 | `PascalCase`（如 `PaperService`） |
| Java 方法/变量 | `camelCase` |
| Python 函数/变量 | `snake_case` |
| Python 类 | `PascalCase` |
| TypeScript 组件 | `PascalCase.tsx` |
| TS 工具/hook/api | `camelCase.ts` 或 `kebab-case.ts` |
| 常量 | `UPPER_SNAKE_CASE` |
| 数据库表/字段 | `snake_case` |

# 6. 数据库与迁移

- **双库架构**：业务数据在 MySQL（backend 维护），AI 向量在 PostgreSQL `paper_chunk`（ai-service 维护）。
- MySQL 建表脚本：`backend/src/main/resources/db/migration-mysql/V{n}__{desc}.sql`（docker-entrypoint-initdb.d 首次初始化执行）。
- PG 迁移脚本：`backend/src/main/resources/db/migration/V{n}__{desc}.sql`。
- 表结构变更必须同步更新 `Implementation/40-database.md`。
- 跨库无物理外键：删除论文时 backend 发 MQ `paper.delete` 让 ai-service 清理 PG chunk（最终一致，见 `70-async-mq.md`）。

# 7. 依赖管理

- 新增依赖必须：
  1. 更新对应 `pom.xml` / `pyproject.toml` / `package.json`；
  2. 同步更新 `Implementation/00-overview.md` 的技术栈表（版本锁定）。
- Python 依赖用 `pyproject.toml` 声明（`[project] dependencies` + `[project.optional-dependencies] test/dev`），不用裸 `requirements.txt` 散装。

# 8. 测试要求

- backend：service 层 JUnit 5 + Mockito 单元测试；controller 用 MockMvc；调用 ai-service 的逻辑必须有 mock 契约测试。
- ai-service：pytest + httpx；**LLM 调用必须可 mock，CI 不消耗真实 token**；PDF 解析与检索用 fixture 固化结果。
- frontend：核心组件 Vitest 单元测试；关键用户流程（登录、上传、Chat、Review 生成）Playwright E2E。
- 提交前本地跑通对应服务测试（`make test-backend` / `make test-ai` / `make test-frontend`）。

# 9. 服务边界铁律

1. ❌ frontend 直连 ai-service 或数据库。
2. ❌ ai-service 写业务表（user/project/paper/task/conversation）。
3. ❌ backend 实现 LLM/向量/PDF 解析逻辑。
4. ❌ service 查询不带 `user_id` 过滤（越权漏洞）。
5. ❌ 单 PR 跨三个服务同时改（必须拆分）。
6. ❌ 只改契约一端就提交（必须同步双方 + 更新 `Implementation/` 契约文档）。

> 详细协作流程见根 `AGENTS.md`。
