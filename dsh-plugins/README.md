# dsh-plugins — ResearchOS 的 DSH 插件包

本目录存放 ResearchOS 融入 DeepSeek Harness 的自研插件包（out-of-tree bundle，
通过 `dsh plugin` 装进 profile，不进 DSH 官方仓库）。

> 注意：`deepseek-harness-master/` 整个目录已被 .gitignore 忽略（第三方源码 + 构建产物 + 日志），
> 本目录只放**自研**代码。

## 包清单

| 包 | 状态 | 说明 |
| --- | --- | --- |
| `research-hello` | ✅ Phase 0 已验证 | 最小 bundle：可拔插闭环证明（插件 + HTTP 路由） |
| `research-mcp` | ✅ Phase 0-2 已验证 | 文献 MCP server：search/get/cite/vector_search（MySQL 真实文献 + 网关 embedding + PG 向量检索）；DSH agent 端到端「检索→读取→引用」已跑通 |
| `research-llm-gateway` | ✅ Phase 0-1 已验证 | 统一 LLM/Embedding 网关（OpenAI 兼容直连代理，chat+embeddings 真实上游）；ResearchOS AI 已正式切到本网关 |
| `scripts/dsh-gateway.sh` | ✅ 已验证 | dsh 常驻启动/停止脚本（自动注入 ResearchOS .env 的网关 key、自动端口） |

**一键常驻启动**（Phase 1 正式切换的前置）：

```sh
./dsh-plugins/scripts/dsh-gateway.sh start   # 默认 3080，被占自动后移
./dsh-plugins/scripts/dsh-gateway.sh status
./dsh-plugins/scripts/dsh-gateway.sh stop
```

## 已验证结论（Phase 0）

**可拔插闭环**（需求 1）：

```sh
# 装（从 DSH checkout 目录执行）
node apps/cli/lib/bin.js plugin --profile web add /abs/path/to/dsh-plugins/research-hello
# 验证装上：插件行出现在插件树
node apps/cli/lib/bin.js --profile web --dump-config | grep research-hello
# 启动后路由响应 JSON（真插件，非 fallback）
curl http://127.0.0.1:3081/research-hello/ping
# → {"ok":true,"service":"research-hello"}

# 拔
node apps/cli/lib/bin.js plugin --profile web remove @researchos/dsh-research-hello
# 验证拔掉：插件行消失，同一 URL 回落为 SPA fallback（HTML），DSH 原生功能不受影响
```

**MCP 接入闭环**（需求 2，最小版）：

在 profile 用户层 `~/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: mcp-client
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: research
        command: node
        args:
          - /abs/path/to/dsh-plugins/research-mcp/server.js
        toolCallTimeoutMs: 30000
        failOnStartupError: false
```

验证：`dsh --profile web` 启动后，`research-mcp/server.js` 作为子进程被 mcp-client 拉起并稳定存活；
server 独立自测 `tools/list` 返回 `literature_search` 工具（schema 完整）。删掉该 insert 即卸载文献工具。

**LLM 网关闭环**（需求 3，最小版）：

```sh
node apps/cli/lib/bin.js plugin --profile web add /abs/path/to/dsh-plugins/research-llm-gateway

# 启动后（默认端口被占时用 --patch 覆盖端口）：
curl -X POST http://127.0.0.1:3081/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"hi"}]}'
# → OpenAI 格式 JSON（choices[].message.content）；上游不可达时结构化 error 透出
curl -X POST http://127.0.0.1:3081/v1/embeddings -H 'content-type: application/json' -d '{"input":"hi"}'
# → 501 stub（embedding 适配器 Phase 1 定）
```

要点：OpenAI 载荷的 `model`/`messages` 映射到 `ctx.llm.stream()` 的 `GenerateOptions`
（provider/model/system/messages）；文本增量取 `text-delta` chunk，终态读 `finish` chunk。
真实出字依赖有效的 LLM 凭据/网络（P0 验证时配置的上游 base URL 不可达，属环境问题非代码问题）。

## Phase 1：LLM 网关正式化（直连上游代理）✅ 已验证

**形态**：OpenAI 兼容直连代理（不再依赖 ctx.llm / DSH 的 provider 配置）：
- `POST /v1/chat/completions` → 上游 `{base}/chat/completions`（JSON / SSE 流式透传）
- `POST /v1/embeddings` → 上游 `{base}/embeddings`
- 配置走环境变量（dsh 启动环境）：`RESEARCH_LLM_BASE_URL/API_KEY/MODEL` + `RESEARCH_EMBEDDING_BASE_URL/API_KEY/MODEL`（兼容 `.env` 的 `OPENAI_*`/`EMBEDDING_*` 兜底）
- 上游路径对齐 OpenAI SDK 语义：`{base}/chat/completions`（不带 `/v1`，实测 SDK 风格 200、`/v1` 风格 404）

**验证（2026-08-17）**：
```sh
# 启动 dsh 时注入环境变量（从 ResearchOS .env 取真实 key/base）
RESEARCH_LLM_API_KEY=$(grep ^OPENAI_API_KEY= .env | cut -d= -f2-) \
RESEARCH_LLM_BASE_URL=$(grep ^OPENAI_BASE_URL= .env | cut -d= -f2-) \
... node apps/cli/lib/bin.js --profile web

# chat 经网关 → 火山引擎真实回复（如「收到」）
curl -X POST http://127.0.0.1:3081/v1/chat/completions -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
# embeddings 经网关 → doubao-embedding-vision 真实向量
curl -X POST http://127.0.0.1:3081/v1/embeddings -H 'content-type: application/json' \
  -d '{"input":"hello","model":"doubao-embedding-vision"}'
```

**ResearchOS 切换方法（零代码改动，仅改配置）**：
把 `.env` 的 `OPENAI_BASE_URL` / `EMBEDDING_BASE_URL` 指向网关：
```
OPENAI_BASE_URL=http://host.docker.internal:3081/v1
EMBEDDING_BASE_URL=http://host.docker.internal:3081/v1
```
已在 ai-service 容器内用真实 OpenAI SDK（ResearchOS 的 `llm/client.py` 同款用法）验证：
`base_url` 指向网关 → 真实回复「网关通」。

> ⚠️ 前置条件：dsh 进程须常驻（当前是手动测试进程）。生产/常驻部署时，网关所在宿主机需与
> ai-service 容器网络互通（macOS Docker Desktop 的 `host.docker.internal` 可用；Linux 服务器
> 需 `--add-host=host.docker.internal:host-gateway` 或同网桥）。
> 网关 key 目前来自 ResearchOS `.env`（启动时注入），正式化后应收口到 DSH `ctx.credentials`。

**数据层 spike**（已验证）：

```sh
# 宿主机 3306/5432 端口映射可达；bundle 用标准 TS 驱动直连现有数据资产
mysql2 → MySQL researchos.paper     ✅（验证时 3 行）
pg     → PG     researchos.paper_chunk ✅（验证时 522 行）
```

结论：MySQL（业务）+ PG（向量）保留现状，ResearchOS bundle 用 mysql2/pg 直连，无架构障碍。
向量维度（`vector(2048)`）与共享网关 embedding 的对齐留待 Phase 1。

> 默认端口 3080 被正式 GUI 占用时，用 `--patch <overlay.yml>` 把 webserver 端口覆盖到空闲端口
> （overlay 内容：`- id: webserver` + `config: {host: '127.0.0.1', port: 3081}`）。

## 包结构规范（照抄 DSH `packages/bundle/*` 形态）

- `package.json`：`dsh.bundle.patch` 指向 `cordis.patch.yml`；`type: module`；peerDependencies 声明 `@deepseek-ai/cordis`
- `cordis.patch.yml`：`- insert:` 行，`{id, name}` 挂插件（name 是本包名，自挂载）
- `index.js`：`export const name` + `export const inject` + `export function apply(ctx)`（Cordis 插件形态）

## Phase 1：正式切换完成（ResearchOS AI 已切到统一网关）✅ 2026-08-17

**状态**：ResearchOS `.env` 的 `OPENAI_BASE_URL` / `EMBEDDING_BASE_URL` 已正式指向网关：

```
OPENAI_BASE_URL=http://host.docker.internal:3081/v1
EMBEDDING_BASE_URL=http://host.docker.internal:3081/v1
```

**执行**：改 `.env`（两行）→ `docker compose --env-file ../.env --profile app up -d --force-recreate --no-deps ai-service`。
注意必须带 `--env-file ../.env`（Makefile 约定），否则 compose 读不到仓库根 `.env` 会用默认值。

**验证（真实链路）**：
- ai-service 容器内真实 OpenAI SDK（`llm/client.py` 同款）：chat 经网关回「网关通」、embeddings 经网关返回 2048 维向量
- 真实业务：`POST /writing/rewrite`（backend 内网 token）→ writing agent → 网关 → 上游，返回真实润色文本
- 网关 key/模型单点收口：上游 `Authorization` 只由网关注入（`RESEARCH_LLM_API_KEY` 等，来自 `.env`），请求侧 key 不校验；模型缺省由网关填（chat `ark-code-latest`、embedding `doubao-embedding-vision`）→ 两端同 key、同模型

**前置条件**：dsh 须常驻（`scripts/dsh-gateway.sh start`，nohup + PID 管理；macOS 容器内 `host.docker.internal` 可达宿主机 3081）。

**遗留（Phase 1 后续）**：
- [ ] 网关限流：当前为直连代理、无速率限制，正式化应加 per-key QPS/并发限制
- [ ] key 收口到 DSH `ctx.credentials`（目前收口到网关 env，来源仍是 ResearchOS `.env`）

## Phase 2：文献 MCP 端到端（DSH agent 检索→读取→引用）✅ 2026-08-17

经 dsh apiproxy（`POST /api/session.create` / `session.prompt` / `session.history`，实例 3081）驱动标准 agent 会话验证：

```
用户：用 literature_search 检索 gibbon；对第一篇用 literature_get 读取元数据/摘要；用 literature_cite 生成 BibTeX
agent：mcp__research__literature_search {query:"gibbon"}
   → 2 篇真实论文（id 51 / 50，MySQL paper 表，标题/作者/年份/READY）
agent：mcp__research__literature_get {paperId:51}
   → 真实元数据 + Paper Intelligence Card summary（DOI/method/tags）
agent：mcp__research__literature_cite {paperIds:[51],format:"bibtex"}
   → @article{DenaJ.Clink2019, title=..., author=..., year={2019}}
agent：中文汇报（标题/作者/年份 + 可粘贴的 BibTeX）
```

结论：需求 2 全链路闭环——DSH agent 经 MCP 工具读 ResearchOS 真实文献（MySQL 业务数据 + 网关 embedding + PG 向量库），ResearchOS 后端仍独立运行。

## 下一步（Phase 1-2 遗留）

- [ ] 网关限流（per-key QPS/并发）与 key 收口到 DSH `ctx.credentials`
- [ ] Phase 3：ResearchOS 后端 TS 重写（bundle 化，MySQL/PG 直连已无架构障碍）
- [ ] Phase 4：前端 DSH React 重写（浏览器只访问 `:3080`）
