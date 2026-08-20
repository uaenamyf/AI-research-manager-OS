# CLAUDE.md - ResearchOS AI 编码规范

> 本文件是项目统一的编码规范。当前工程 = DeepSeek Harness（DSH）单实例承载全部
> ResearchOS 能力（bundle / AI worker / 网关 / UI 包），数据库仅保留 postgres + mysql；
> legacy backend（Java）与 ai-service（Python）已于 2026-08-19 移除（git 历史可回退）。
>
> - 多服务协作规则见 `AGENTS.md`（本文档的配套文档）。
> - 实现方案与契约见 `Implementation/` 文件夹。
> - 融合包约束见 `deepseek-harness-master/packages/researchos/` 与 DSH `packages/client/AGENTS.md`。

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

- **语言与版本**：融合包以 TypeScript/JavaScript 为主（DSH `packages/researchos/`，bundle 为 Cordis 插件形态、UI 包为 React 客户端包）；DSH 本体见 `deepseek-harness-master/CLAUDE.md`。
- **编码风格**：JS/TS 用 Prettier（2 空格）；bundle 遵循 Cordis 插件规范（`export function apply(ctx)`）。
- **注释语言**：注释/文档用中文写说明，标识符用英文；对外用户可见文案一律英文（i18n 规范）。
- **禁止**：硬编码密钥/Token/连接串（必须走环境变量，由 `scripts/dsh-gateway.sh` 注入）；提交编译不过或测试失败的代码。

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

- **双库架构**：业务数据在 MySQL（research-* bundle 维护），AI 向量在 PostgreSQL `paper_chunk`（research-ai-worker 维护）。
- MySQL 建表脚本：`infra/mysql-init/V{n}__{desc}.sql`（docker-entrypoint-initdb.d 首次初始化执行，来源为已移除的 `backend/src/main/resources/db/migration-mysql/`，git 历史可查）。
- PG 迁移脚本：原 `backend/src/main/resources/db/migration/V{n}__{desc}.sql`（git 历史可查；当前 PG 直接由 pgvector 镜像 + research-ai-worker 建表）。
- 表结构变更必须同步更新 `Implementation/40-database.md`。
- 删除论文时 research-paper 删 MySQL `paper` 记录并清理 PG chunk（向量清理入口在 research-ai-worker）。

# 7. 依赖管理

- 新增依赖必须更新对应 `package.json`（DSH 融合包在 `deepseek-harness-master/packages/researchos/`），并同步更新 `Implementation/00-overview.md` 的技术栈表（版本锁定）。
- DSH 本体依赖（pnpm workspace）见 `deepseek-harness-master/package.json` / `pnpm-workspace.yaml`。
- **DSH 升级（submodule）**：`deepseek-harness-master` 是 submodule（fork `uaenamyf/dsh-researchOS` 的 main = 自定义版本，upstream = `deepseek-ai/deepseek-harness`）。每次上游发版运行 `scripts/upgrade-dsh.sh <tag>`（如 `rc.9`）：
  - fetch upstream tag → 从 main 建 `upgrade/<tag>` 分支 → merge（冲突预期仅限修改过的上游文件）→ `pnpm install` + `build:lib:host/client` + `build:web` → `pnpm vitest run packages/client/ui-layout` → `--push` 更新 fork main + 父仓库 submodule 指针。
  - 注意：submodule 内的 `node_modules` / `lib` / `dist` / `vendor/*/lib` 是构建产物（git 不跟踪），升级 merge 后如缺失需重建或从备份恢复，不能只靠 git 内容。

# 8. 测试要求

- 融合包（bundle / UI 包 / ai-worker）：改动按 DSH `packages/client/AGENTS.md` 与 `deepseek-harness-master/packages/researchos/` 的规范验证；LLM 相关改动保持可 mock、CI 不消耗真实 token。
- legacy backend / ai-service 测试已随服务移除（git 历史可回退，见 `HEAD:backend/`、`HEAD:ai-service/`）。
- 提交前本地跑通对应验证（`make help` 查看可用命令；DSH 起停 `make start-dsh` / `make stop-dsh`）。

# 9. 服务边界铁律

1. ❌ UI 客户端包直连数据库（必须走 research-* bundle 的 `/research-*` 路由）。
2. ❌ research-ai-worker 写业务表（user/project/paper/task 归属 research-* bundle）。
3. ❌ bundle 内实现 LLM/向量/PDF 解析逻辑（归属 research-ai-worker 与 research-llm-gateway）。
4. ❌ service 查询不带 `user_id` 过滤（越权漏洞）。
5. ❌ 硬编码密钥/Token/连接串（必须走环境变量，由 `scripts/dsh-gateway.sh` 注入）。

> 详细协作流程见根 `AGENTS.md`。
