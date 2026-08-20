# ResearchOS 测试指南

> 2026-08-19 更新：legacy backend（Java/Spring）与 ai-service（Python/FastAPI）已
> 移除（测试源码在 git 历史 `HEAD:backend/`、`HEAD:ai-service/` 可回退）；当前应用层 =
> DSH 融合包（`deepseek-harness-master/packages/researchos/`），验证方式如下。
> 2026-08-22 更新：数据库全 SQLite 化（`infra/` docker 已删除），数据层验证直接查 SQLite。

## 目录

- [快速开始](#快速开始)
- [融合包验证（bundle / UI 包 / ai-worker）](#融合包验证bundle--ui-包--ai-worker)
- [数据层验证（SQLite）](#数据层验证sqlite)
- [浏览器端到端验证（研究区）](#浏览器端到端验证研究区)
- [CI 流水线](#ci-流水线)

---

## 快速开始

```bash
# 1. 启动 DSH（前端 + 业务 bundle + AI 管道，:3080；零数据库依赖）
make start-dsh

# 2. 打开浏览器验证研究区
#    http://127.0.0.1:3080
```

停止：

```bash
make stop-dsh
```

> 2026-08-22 起运行时零外部数据库（SQLite 单文件自动创建），无需 `make infra-up`。

---

## 融合包验证（bundle / UI 包 / ai-worker）

改动 `deepseek-harness-master/packages/researchos/` 下的代码时：

| 验证项 | 命令 / 方式 |
|------|------|
| JS 语法 | `node --check <file>.js`（改动的文件逐个跑） |
| bundle 结构 | `package.json` 声明 `dsh.bundle` / `dsh.client` + `cordis.patch.yml` 自挂载 + `index.js` `export function apply(ctx)` |
| UI 包 slot / props | 遵循 DSH `packages/client/AGENTS.md` 的 `ConversationNodeDefinition` 规范 |
| 可拔插 | `dsh plugin --profile web add|remove`，卸载不破坏其余功能 |
| LLM 相关改动 | 保持可 mock，CI 不消耗真实 token |

常用验证命令：

```bash
# 语法检查（整个 researchos 目录）
ROOT=deepseek-harness-master/packages/researchos
find "$ROOT" -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check
```

> DSH 本体（`deepseek-harness-master/`）为其自带测试体系（vitest 等），改动 DSH 本体时
> 按其自身 `CLAUDE.md` / `AGENTS.md` 执行。

---

## 数据层验证（SQLite）

```bash
# 数据库文件与表结构
node --input-type=module -e "
import { getDb } from './deepseek-harness-master/packages/researchos/lib/db.js'
const db = getDb()
console.log('tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all().map(r => r.name).join(', '))
console.log('papers:', db.prepare('SELECT COUNT(*) n FROM paper').get().n)
console.log('chunks:', db.prepare('SELECT COUNT(*) n FROM paper_chunk').get().n)
"
```

---

## 浏览器端到端验证（研究区）

启动 DSH 后，在浏览器打开 `http://127.0.0.1:3080` 验证：

1. **研究区**：文献目录树显示（库/论文），点击论文 → 右侧详情（Paper Card）打开。
2. **PDF 打开**：论文卡片内的 PDF 预览由 research-file 本地存储（`~/.researchos/uploads`）直接提供（无 legacy backend 回退）。
3. **论文分析链路**：上传 PDF → `paper.status` 从 `PROCESSING` 变为 `READY`（research-ai-worker inline 直调，无 RabbitMQ）。
4. **综述生成**：勾选论文 → 生成综述，任务轮询至 `SUCCESS`。
5. **写作助手**：写作节点动作走 `research-llm-gateway` 统一网关。

---

## CI 流水线

GitHub Actions 配置在 `.github/workflows/ci.yml`

### 触发条件

- 推送到 `main` 或 `dev` 分支
- 针对 `main` 或 `dev` 的 Pull Request

### CI 阶段

```
┌─────────────────────────────────────────────────────────┐
│                    CI PIPELINE                           │
├─────────────────────────────────────────────────────────┤
│  1. ResearchOS Bundles Syntax                           │
│      ├─ node --check 全部 bundle / ai-worker / gateway  │
│      └─ SQLite schema sanity（lib/db.js 含建表）        │
└─────────────────────────────────────────────────────────┘
```

### 本地模拟 CI 运行

```bash
# 1. 语法检查
ROOT=deepseek-harness-master/packages/researchos
find "$ROOT" -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check
```

---

## 常见问题

### Q: DSH 起不来 / 3080 无响应

**A:** 查看网关日志：

```bash
make logs      # tail -f .dsh-gateway.log
make status    # pid 是否存活
```

### Q: 数据库文件未初始化（表不存在）

**A:** 2026-08-22 起数据库为 SQLite 单文件（`~/.researchos/data/researchos.db`），首次启动
`lib/db.js` 自动建表，无需手工初始化。若想重置，删除数据库文件即可：

```bash
rm -f ~/.researchos/data/researchos.db   # 下次启动自动重建（make reset 亦可）
```

---

## 附录：测试数据 Fixtures

```
backend/
  └─ src/test/resources/
      └─ application-test.yml    # 测试环境配置（H2 DB）

ai-service/
  └─ tests/
      └─ test_paper.pdf          # 用于 PDF 解析测试的样本论文
```
