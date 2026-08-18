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
| `research-auth` | ✅ Phase 3 首域起步 | 认证 bundle：register/login/logout/me 直连 MySQL app_user；与旧 Spring Boot 共享 JWT_SECRET 双认证（token 双向互通已验）；响应沿用 `{code,message,data}` 契约 |
| `research-project` | ✅ Phase 3 文献域 | 项目 CRUD bundle：create/list(分页)/detail/delete 直连 MySQL research_project，严格 user_id 过滤（越权 404 已验），认证复用共享 JWT |
| `research-folder` | ✅ Phase 3 文献域 | 文件夹树 CRUD bundle：create/tree/children/rename/move/delete/sort 直连 MySQL folder，user+project 归属校验，递归删除，move 防循环/跨项目 |
| `research-paper` | ✅ Phase 3 文献域 | 论文管理 bundle：create/import(Crossref)/list(文件夹过滤)/detail/status/card/move/reading/delete 直连 MySQL paper，MQ 触发+清理（paper.analyze/paper.delete 全链路已验），配额开关 |
| `research-file` | ✅ Phase 3 文献域 | 文件存储 bundle：upload-url presign / multipart 上传 / 下载(全量+Range) / 删除（~/.researchos/uploads，路径穿越防护），旧后端 PDF 代理兜底读取 |
| `research-writing` | ✅ Phase 3 AI 域 | 写作 Agent bundle：6 动作 LLM 改写（走共享网关 + llmOverride 直连/回退）+ MyMemory 机器翻译；prompt 与 ai-service 同源 |
| `research-review` | ✅ Phase 3 AI 域 | 综述生成 bundle：任务 create + MQ review.generate + 轮询（ai-service 消费→RAG→LLM→回调 backend→SUCCESS 全链路已验） |
| `research-paper-card` | ✅ Phase 3 AI 域 | Paper Card bundle：POST /generate {text} → 共享网关生成结构化 12 字段 Card（prompt 与 ai-service 同源，JSON 容错解析） |
| `research-export` | ✅ Phase 3 剩余域 | 导出+引用 bundle：单篇/批量 BibTeX+RIS、APA/MLA/GB7714 引用与参考文献（渲染与后端逐字节一致；批量强制 user_id 过滤） |
| `research-settings` | ✅ Phase 3 剩余域 | 用户设置 bundle：GET/PUT/PATCH app_user.settings（llm/translation/knowledge 三段，非空字段合并） |
| `research-subscription` | ✅ Phase 3 剩余域 | 订阅 bundle：plans / Stripe checkout（REST+错误路径）/ webhook（HMAC 签名校验 + 只升不降升级） |
| `ui-research-hello` | ✅ Phase 4 可行性证明 | 最小客户端 UI 包：声明 dsh.client + lib/client.js（__ModuleLoader__ 格式），sidebar 底部面板调 /research-project 显示项目数；boot 自动注入 + client.js 服务已验证 |
| `ui-research-library` | ✅ Phase 4 v0.1 | 文献库富卡片聊天节点：匹配标准 tool 事件（literature_search → 文献卡片），真实事件重放验证 |
| `ui-research-paper` | ✅ Phase 4 v0.1 | Paper Card 聊天节点：literature_get → 完整 Paper Intelligence Card（method/finding/limitation/future_work/tags） |
| `ui-research-citation` | ✅ Phase 4 v0.1 | 引用卡片聊天节点：literature_cite → BibTeX/RIS 等宽渲染 + 复制按钮 |
| `ui-research-dashboard` | ✅ Phase 4 v0.1 | 统计面板节点：用户消息关键词触发（dashboard/仪表盘/统计）→ 自取数（项目/论文/套餐/最近项目） |
| `ui-research-writing` | ✅ Phase 4 v0.1 | 写作面板节点：关键词触发 + 动作/文本提取 → 调 /research-writing/rewrite 显示改写结果 |
| `ui-research-settings` | ✅ Phase 4 v0.1 | 设置面板节点：关键词触发（设置/settings/配置）→ 读 /research-settings 表单编辑 + PATCH 保存 |
| `ui-research-literature` | ✅ Phase 4 v0.1 | 文献检索面板节点：关键词触发 + 查询词预填 → 调 /research-paper/search 结果列表 |
| `ui-research-review` | ✅ Phase 4 v0.1 | 综述生成面板节点：主题 + 论文勾选 → generate → 轮询任务 → Markdown 综述展示 |
| `ui-research-upload` | ✅ Phase 4 v0.1 | 上传面板节点：项目/文件夹选择 + PDF → presign → multipart → 建论文（触发分析） |
| `ui-research-project` | ✅ Phase 4 v0.1 | 项目管理面板节点：新建/删除项目 + 文件夹树 + 新建/删除文件夹 |
| `scripts/dsh-gateway.sh` | ✅ 已验证 | dsh 常驻启动/停止脚本（自动注入 ResearchOS .env 的网关 key、自动端口、JWT/MySQL 配置） |

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

## Phase 3：research-auth bundle（DSH 内认证，与旧后端双认证）✅ 2026-08-17

**形态**：Phase 3 首个业务域 bundle。直连 MySQL `app_user`，经 `ctx.webServer` 暴露认证端点，
响应沿用 ResearchOS `{code,message,data}` 契约（与旧后端可无缝替换）：

```
POST /research-auth/register   { email, password }   -> { user } + httpOnly cookie
POST /research-auth/login      { email, password }   -> { user } + httpOnly cookie
POST /research-auth/logout                            -> 清 cookie
GET  /research-auth/me         (cookie 或 Authorization: Bearer) -> userDto
```

**双认证关键**：与旧 Spring Boot **共享同一 `JWT_SECRET`**（HS256，`JwtTokenProvider` 同款
`sub/email/plan/iat/exp`），bcrypt 同款校验。验证结论：
- bundle 签发的 token 被真实后端 `GET /api/auth/me` 接受（Bearer 与 `access_token` cookie 均通过）
- 后端同款 token 亦被 bundle `/research-auth/me` 接受（双向互通）→ 前端切换无需重新登录
- 负例：错密码 401、重复邮箱 400、无 token/坏 token 401、短密码 400

**安装/卸载**（与其它 bundle 同）：

```sh
node apps/cli/lib/bin.js plugin --profile web add /abs/path/to/dsh-plugins/research-auth
node apps/cli/lib/bin.js plugin --profile web remove @researchos/dsh-research-auth
```

**配置**：`scripts/dsh-gateway.sh` 启动时注入 `JWT_SECRET` + `RESEARCH_MYSQL_*`（默认
`researchos@127.0.0.1:3306/researchos`，与 research-mcp 同源）。

> ⚠️ **坑位（已修）**：`dsh-gateway.sh` 原先用 `.env` 的 `OPENAI_BASE_URL` 作为网关上游；
> Phase 1 切换后 `OPENAI_BASE_URL` 指向网关自身 → 网关自环 fetch 失败。已改为读取专用的
> `.env` 变量 `RESEARCH_LLM_UPSTREAM_BASE_URL`（真实上游），未设置时回退旧行为。

**遗留/注意**：`createdTime` 序列化时区与后端略有差异（bundle 走 ISO-UTC，后端本地时区），
属展示层差异不影响认证；旧 `AuthController` 尚未下线（并行阶段，等 Phase 4 前端切换后再下线）。

## Phase 3：research-project bundle（项目 CRUD，user_id 强隔离）✅ 2026-08-17

文献域第一个业务 bundle。直连 MySQL `research_project`，经 `ctx.webServer` 前缀路由 `/research-project`
暴露（复用共享 JWT 认证，跨 bundle 免重新登录）：

```
POST   /research-project            { name, description, domain } -> 创建
GET    /research-project?page=0&size=20                            -> 分页列表（created_time DESC）
GET    /research-project/:id                                       -> 详情（非本人 404）
DELETE /research-project/:id                                       -> 删除（非本人 404）
```

**关键验证**：
- 所有查询 `WHERE user_id = ?`（归属铁律）：用户 A 访问/删除用户 B 的项目 → 404
- 分页契约对齐后端 `{ items, page, size, total, totalPages }`
- 认证：bundle 内联 JWT 验签（同 `JWT_SECRET`）+ 校验 subject 对应 app_user 仍存在（同 JwtAuthFilter）
- 负例：无 token/坏 token 401、非数字 id 404、method 405

## Phase 3：research-folder bundle（文件夹树 CRUD，防循环/递归删除）✅ 2026-08-17

文献域第二个业务 bundle。直连 MySQL `folder`（parent_id 树），经 `ctx.webServer` 前缀路由
`/research-folder` 暴露，复用共享 JWT 认证：

```
POST   /research-folder/folders                            { projectId, parentId?, name }
GET    /research-folder/projects/:projectId/folders/tree   -> 嵌套树（children 递归，sort_order DESC + name ASC）
GET    /research-folder/projects/:projectId/folders?parentId=  -> 根/子列表
PUT    /research-folder/folders/:folderId/rename   { name }
PUT    /research-folder/folders/:folderId/move     { parentId }
PUT    /research-folder/folders/:folderId/sort     { sortOrder }
DELETE /research-folder/folders/:folderId                 -> 递归删除该文件夹及全部子孙
```

**关键验证**：
- 树构建：A→A1→A1a 嵌套正确、排序正确；根/子列表分派正确
- 防呆：子级重名 400；move 进自身 400、move 进自身子孙 400（循环引用）、跨项目 400
- 递归删除：删 A1 连带 A1a；删 A 连带全部子孙
- 归属：user1 读 user4 树返回空（user 作用域）；user1 改 user4 文件夹 404（跨用户不泄露）
- 创建时校验项目归属 + 父文件夹归属/同项目（比旧后端多一层 project 归属校验，防越权插行）

> 行为对齐说明：① 根级同名允许（MySQL UNIQUE 对 NULL parent_id 判等绕过，旧后端同依赖 DB
> 约束，行为一致）；② 跨用户文件夹访问本 bundle 返回 404（旧后端 403）——统一为 404 更安全
> （不泄露资源存在性），与 research-project 一致。

## Phase 3：research-paper bundle（论文管理 + MQ 全链路）✅ 2026-08-17

文献域第三个业务 bundle。直连 MySQL `paper`，经 `ctx.webServer` 前缀路由 `/research-paper` 暴露，
复用共享 JWT 认证：

```
POST   /research-paper/projects/:pid/papers             { fileName, s3Key, folderId? } -> { id, status } + MQ paper.analyze
POST   /research-paper/projects/:pid/papers/import      { doi?, title?, authors?, year?, folderId?, pdfUrl? } -> paper（Crossref 补全，有 pdf 才触发分析）
POST   /research-paper/projects/:pid/papers/upload-url  -> 501（双认证阶段上传仍走旧后端）
GET    /research-paper/projects/:pid/papers?folderId=&page=&size=  -> 分页列表（folderId: 空=根 / -1=全部 / 其他=指定）
GET    /research-paper/papers/:id | /status | /card
PUT    /research-paper/papers/:id/move { folderId }  |  /reading { readingStatus?, starRating? }
DELETE /research-paper/papers/:id                     -> 删除 + MQ paper.delete
```

**MQ 异步链路（关键验证，与旧 backend→ai-service 契约一致）**：
- 创建论文 → 发 `researchos.ai.task` / `paper.analyze`，消息 `{taskId, type, payload}` → **ai-service 真实消费**
  （日志「收到论文分析任务：paperId=52」）→ 处理后回调 backend 更新状态（bogus pdf 404 → 回调 FAILED，状态闭环）
- 删除论文 → 发 `paper.delete` → **ai-service 真实清理 chunk**（日志「论文删除清理完成：paper_id=52, 删除 0 个 chunk」）
- MQ 发失败时回滚（删除刚插入的 paper 行 / 不删除原行），保持 DB 一致

**其它验证**：import 用真实 DOI 经 Crossref 补全 title/authors/year（无 pdf → UPLOADED 不触发分析）；
list 的 folderId 三种语义（根/全部/指定）正确；move 可移入文件夹/移回根（显式 SET NULL）；
reading 更新 readingStatus/starRating；越权 404；无 token 401；配额开关 `ENFORCE_QUOTA`（默认关，镜像后端 dev 开关）。

> 双认证阶段说明：上传（upload-url + 文件读写）仍由旧后端承担（`research-file` bundle 将接手），
> 本 bundle 创建论文时直接以旧后端签发的存储 key 作为 pdfUrl。

## Phase 3：research-file bundle（本地文件存储 + 旧 PDF 代理兜底）✅ 2026-08-17

文献域收尾 bundle，DSH 原生文件存储（镜像后端 FileController + LocalStorageService 契约），
存储目录 `RESEARCH_STORAGE_LOCAL_DIR`（默认 `~/.researchos/uploads`），key 布局
`papers/{uuid}/{fileName}`：

```
POST   /research-file/upload-url            { fileName, contentType } -> { url, fields:{ key } }   (JWT，一次性 token)
POST   /research-file/local-upload/:token   multipart(file+key)       -> { key }                    (JWT + token 校验)
GET    /research-file/files/{key...}        全量 / Range(206) 下载     -> 本地，缺则代理旧后端          (JWT 或 X-Internal-Token)
DELETE /research-file/files/{key...}        删除本地文件（顺带清空目录）                               (JWT)
```

**关键验证**：
- 全链路：presign → multipart 上传 → 下载字节一致 → Range 206 → 删除
- 一次性 token：重复使用同一 upload URL → 400「invalid upload token」
- 路径穿越防护：`resolveKey` 强制 key 落在 uploadDir 内（同后端 startsWith 检查）
- **旧 PDF 代理兜底**：本地无此文件时带 `X-Internal-Token` 转后端 `/api/files/{key}`——真实返回
  后端存储的论文 PDF（Clemins.pdf 327KB，200）→ 双认证阶段前端可经 DSH 统一读取新旧 PDF
- 鉴权：无 token 下载/删除 401；`/research-auth` 签发的 token 直接可用

> 双认证阶段说明：新上传走本 bundle 本地目录，旧后端已有 PDF 走代理兜底（macOS 下 docker 卷
> 对宿主机不可直接读，故不直读）。S3 分支未实现（当前 `STORAGE_TYPE=local`，与后端一致）。

## Phase 3：research-writing bundle（写作 Agent，LLM 走共享网关）✅ 2026-08-17

AI 域第一个 bundle，替代 backend `/api/writing/*` + ai-service writing_agent 整条链，prompt 与
ai-service 同源（`app/agents/prompts/writing.py` 原样搬运），LLM 调用走**共享网关**（需求 3）：

```
POST /research-writing/rewrite
  { text, action?: polish|expand|shorten|translate|rebuttal|cover_letter, instruction?, llmOverride? }
  -> { action, text }
POST /research-writing/translate-machine
  { text, targetLang? } -> { text, sourceLang, targetLang }   （MyMemory 免费引擎）
```

**LLM 路由（镜像 ai-service llm/client.py）**：
- 无 override → 共享网关 `POST {RESEARCH_GATEWAY_URL}/v1/chat/completions`（模型 RESEARCH_LLM_MODEL）
- 有 llmOverride（用户自定义 apiKey/baseUrl/model）→ 直连该端点（绕过网关）
- override 失败 → 自动回退系统默认（已验证直连 shorten 正常）
- 结果剥离 markdown 代码围栏

**关键验证**：polish/translate(中文)/未知 action 回退 polish/空文本、translate-machine 双向
（en↔zh-CN，源语言检测 CJK→zh-CN）、llmOverride 直连、401 无 token。

> **顺手修复**：`dsh-gateway.sh` 的 `RESEARCH_GATEWAY_URL` 在端口 bump 前导出（指向 3080 GUI
> 而非 3081 网关），导致 MCP vector_search 的 embedding 调用打错端口——已改为 bump 后导出，
> vector_search 恢复真实语义检索（paperId 51, score 0.92 实测）。

## Phase 3：research-review bundle（综述生成，MQ 全链路）✅ 2026-08-17

AI 域第二个 bundle，替代 backend ReviewController + AiTaskService，直连 MySQL `ai_task` +
发共享 MQ（`researchos.ai.task` / `review.generate`），ai-service 消费后回调**旧 backend**
更新同一任务行——bundle 无缝接入既有管道：

```
POST /research-review/generate   { paperIds: number[], topic: string } -> { taskId }   (JWT)
GET  /research-review/:taskId                                           -> task        (JWT, 归属校验)
```

**全链路（真实端到端已验）**：generate（校验每篇论文归属 → ai_task PENDING → MQ review.generate，
发失败回滚删行）→ ai-service「收到综述生成任务：taskId=7」→ review_agent（papers=3,
检索片段=12 RAG）→ LLM 生成 Markdown → 回调 backend PATCH /internal/task/7/result →
任务 SUCCESS，result.markdown 完整综述（含 [P3] 等引用标注）。负例：越权 404 / 无效
paperIds 404 / 空数组 400 / 无 token 401。

> llmOverride：backend 从用户设置构建后随 MQ payload 携带（`research-settings` bundle
> 落地后本 bundle 同步支持）。

## Phase 3：research-paper-card bundle（Paper Intelligence Card 生成）✅ 2026-08-17

AI 域收尾 bundle，替代 ai-service paper_agent 的 Card 生成，prompt 与
`app/agents/prompts/paper_card.py` 同源，LLM 走**共享网关**（需求 3）：

```
POST /research-paper-card/generate   { text } -> card   (JWT)
```

**生成逻辑（镜像 paper_agent）**：文本截断 12000 字符 → PAPER_CARD_SYSTEM（严格 JSON 约束）→
共享网关 → 容错解析（剥 markdown 围栏/JSON 边界提取）→ 字段默认值填充。

**验证**：真实论文文本 → 完整 12 字段 Card（title/authors/year/doi/keywords×8/abstract/workflow/
method/finding/limitation/future_work/tags×5 带 name+category），method「MFCC+SVM 半自动声纹
流水线」、finding「99.5% 个体识别准确率」等真实内容；空文本 400、无 token 401。

> skill/agent 形态（供 DSH agent 直接调用）留待 Phase 4 前端接入时注册；
> 管道集成（MQ 消费 + PG chunk 组装）随 ai-service 下线（Phase 5）迁移。

## Phase 3：research-export bundle（导出 + 引用渲染）✅ 2026-08-17

合并后端 ExportController + CitationController（共享渲染逻辑），直连 MySQL `paper`：

```
GET  /research-export/papers/:id/export/bibtex | /ris            -> 单篇导出
POST /research-export/papers/export/bibtex | /ris  { paperIds }  -> 批量导出 { ..., count }
GET  /research-export/papers/:id/citation?format=APA|MLA|GB_7714 -> 单篇引用
POST /research-export/citation/bibliography { paperIds }?format= -> 参考文献列表
```

**关键验证**：
- 渲染与后端**逐字节一致**：单篇 BibTeX 实测与 `/api/papers/51/export/bibtex` 输出完全相同
- 三种引用格式（APA/MLA/GB_7714）与 citation key（首作者姓氏+年份）逻辑一致
- **越权修复**：批量端点强制 `WHERE user_id = ?`（后端原实现 `getById` 不校验、按 id 可导任意论文），
  非本人 id 自动过滤，count 反映实际导出数
- 单篇越权 404、无 token 401、非法 format 回退 APA

## Phase 3：research-settings + research-subscription bundle ✅ 2026-08-17

**research-settings**（用户设置，直连 `app_user.settings` JSON）：
```
GET   /research-settings                  -> settings（llm/translation/knowledge 三段）
PUT   /research-settings  { settings }    -> 全量替换
PATCH /research-settings  { patch }       -> 非空字段合并（null 不覆盖，镜像 SettingsServiceImpl）
```

**research-subscription**（订阅）：
```
GET  /research-subscription/plans                     -> 套餐列表（公开）
POST /research-subscription/checkout  { plan }        -> Stripe Checkout（REST，成功返 {url, sessionId}）
POST /research-subscription/webhook                   -> Stripe-Signature HMAC 校验 + 事件处理
```

**关键验证**：
- settings：PUT 全量替换、PATCH 非空合并（改 temperature 保留 provider）、null 字段不覆盖、401
- subscription：plans 3 档；checkout 错误路径（FREE/非法 plan 400、未配置 price 500）；
  webhook 签名校验（坏签名 400 / 自构有效签名通过）→ `checkout.session.completed` 升级用户
  **只升不降已验**（PRO→RESEARCHER 升级成功、FREE 降级被拒）；未知事件「ignored」
- Stripe key 当前为占位符，真实支付需配 `STRIPE_SECRET_KEY` + `STRIPE_PRICE_*`

> **Phase 3 bundle 清单全部完成（11 个）**：auth / project / folder / paper / file /
> writing / review / paper-card / export / settings / subscription。下一步：旧 Spring Boot
> 控制器逐个下线（Phase 3 出口）→ Phase 4 前端 DSH React 重写。

## Phase 3 出口：可拔插回归验证 ✅ 2026-08-17

**「卸载任一 bundle 不破坏其他功能」实测通过**（出口验收项）：

```
dsh plugin --profile web remove @researchos/dsh-research-folder  → 重启
  → /research-folder/* 路由消失（回落 SPA fallback HTML，非 JSON）
  → auth / project / paper / export / subscription 全部正常（code 0）
dsh plugin --profile web add .../research-folder                 → 重启
  → 路由恢复（folder tree 正常，4 roots）
```

- Phase 0 遗留的 `research-hello` 孤儿符号链接已从 profile node_modules 清理
- **旧 Spring Boot 控制器下线**：留待 Phase 4 前端切到 `:3080` 后按 plan.md 下线映射逐个执行
  （当前前端仍直连 backend `/api/*`，双认证阶段保留 backend 不破坏现有功能）

## Phase 4：UI 可行性证明（out-of-tree 客户端包）✅ 2026-08-17

**核心结论：out-of-tree DSH 客户端 UI 包免重建 web app**，机制已验证：

```
dsh-plugins/ui-research-hello/
  package.json     dsh.client: {platform:"web"} + exports["./client"] → lib/client.js
  lib/index.js     node half（空 apply，使包成为 loader 条目）
  lib/client.js    浏览器 half：window.__ModuleLoader__.load({id, factory}) 格式，
                   注册 sidebar.footer.action 面板 → fetch /research-project 显示项目数
```

`dsh plugin add` + 重启后，`dsh-client-modules` 自动扫描 → boot 清单注入新条目
（`@researchos/ui-research-hello → /plugins/.../client.js?rev=...`）→ 浏览器 GUI 自动加载。
已验证：boot 39 条目包含新包、client.js 以 text/javascript 正常服务、rev 命中 200、
其余 bundle 不受影响。

**查看效果**：打开 `http://127.0.0.1:3081` 侧边栏底部（📚 ResearchOS · N projects）。
后端 bundle 的 `/research-project` 等接口已就绪，后续 `ui-research-library` 等页面
按此机制逐个构建（组件需遵循 slot/props 规范，见 DSH `packages/client/AGENTS.md`）。

## Phase 4：ui-research-library v0.1（文献库聊天节点）✅ 2026-08-17

文献库 UI 的第一个落地形态：**聊天内的富文献卡片节点**。

```
dsh-plugins/ui-research-library/
  lib/client.js  ConversationNodeDefinition「research-library」：
    - match 标准 turn/start + tool/call + tool/result 会话事件（ui-deliverables 同款模式，
      无需 host 发自定义事件）
    - tool/call 时按 callId 记录 research MCP 工具名（literature_search/get/vector_search）
    - tool/result 时解析对应工具的 JSON 结果，累积论文列表
    - buildViewNode 产出「📚 ResearchOS 文献库」卡片（标题/作者/年份/状态）
```

**验证**：boot 清单注入 + client.js 服务 + **真实会话事件重放**（turn/start→tool/call
(literature_search)→tool/result → 节点数据含真实论文 id 50/标题/2021/READY）。

**浏览器效果**：在 GUI（`http://127.0.0.1:3081`）让 agent 执行 `literature_search` 检索后，
对话流中会出现文献库卡片。完整项目/文件夹树/上传页面（v0.2+）后续按此模式扩展。

## Phase 4：ui-research-paper v0.1（Paper Card 聊天节点）✅ 2026-08-17

论文详情 UI：`literature_get` 工具结果 → 完整 **Paper Intelligence Card** 节点
（标题/作者/年份/状态 + Abstract/Method/Finding/Limitation/Future Work + Tags）。

- 与 ui-research-library 同款 Definition 模式（标准 tool 事件匹配），**按工具分流**：
  `literature_search` → 文献库列表卡（library 节点）、`literature_get` → 论文详情卡（paper 节点）
- **验证**：boot 注入 3 个 research UI 条目（hello/library/paper）、client.js 服务、
  **真实 literature_get 事件重放**（论文 id 51 → metadata + method/finding/limitation/future_work + 5 tags 完整产出）

**浏览器效果**：GUI 中让 agent 执行 `literature_get`（如「读取论文 51 详情」），对话流出现
完整论文卡片。PDF 查看器（react-pdf）留待 v0.2。

## Phase 4：ui-research-citation v0.1（引用卡片聊天节点）✅ 2026-08-17

`literature_cite` 工具输出（BibTeX/RIS）→ 格式化**引用卡片**节点：等宽渲染 + 复制按钮。

- 与 library/paper 节点同款 Definition 模式（标准 tool 事件匹配），按工具分流：
  `literature_search`→列表卡、`literature_get`→详情卡、`literature_cite`→引用卡
- **验证**：boot 注入 4 个 research UI 条目、client.js 服务、真实 cite 事件重放
  （`@article{DenaJ.Clink2019,...}` 完整产出）

**浏览器效果**：GUI 中让 agent 执行「为论文 51 生成 BibTeX 引用」（`literature_cite`），
对话流出现带「复制」按钮的引用卡片。MCP 文献工具驱动的 UI 集合（search/get/cite）完成。

## Phase 4：ui-research-dashboard v0.1（用户消息触发统计面板）✅ 2026-08-17

**新模式验证**：非 MCP 工具页面的触发方式——**用户消息关键词触发**。

```
用户输入含 dashboard / 仪表盘 / 统计 / stats 的句子 → 触发 research-dashboard 节点
  → 渲染自取数面板：/research-project（项目数+列表）+ 各项目 /research-paper 计数
    + /research-auth/me（套餐）
```

**验证**：触发逻辑（4 个关键词命中、无关消息/其他事件不触发）+ 数据源（真实 token：
1 项目 / 3 论文 / FREE 套餐）+ boot 注入 5 个 research UI 条目 + client.js 服务。

**浏览器效果**：GUI 中发送「打开仪表盘」→ 对话流出现统计面板（项目数/论文数/套餐/最近项目）。

> 此模式将复用于 `ui-research-writing` / `ui-research-settings` / `ui-research-assistant`
> 等非工具页面（各自匹配自己的关键词触发）。

## Phase 4：ui-research-writing v0.1（写作面板节点）✅ 2026-08-17

用户消息关键词触发（写作/改写/润色/扩写/缩写/翻译/审稿/cover letter 等）→ **写作面板**：

```
Definition 提取：
  - 动作：消息含「翻译」→ translate、「缩写/缩短」→ shorten、「润色」→ polish…
  - 文本：关键词之后的文字预填（剥掉「这段/以下」等连接词）
渲染器（面板）：
  - 文本域 + 动作下拉（6 动作）+ 指令输入 + 「改写」按钮
  - 点击 → POST /research-writing/rewrite → 展示改写结果
```

**验证**：触发/提取逻辑（4 类消息命中 + 动作识别 + 文本预填 + 无关消息不触发）；
`/research-writing/rewrite` 端到端（真实润色输出）；boot 注入 6 个 research UI 条目。

**浏览器效果**：发送「润色这段：The results are good.」→ 写作面板预填文本，点「改写」出结果。

## Phase 4：ui-research-settings v0.1（设置面板节点）✅ 2026-08-17

关键词触发（设置/settings/配置/config）→ **设置面板**：

```
加载：GET /research-settings → 三段表单（LLM 配置 / 翻译配置 / Knowledge-RAG）
编辑：Provider / Base URL / 默认模型 / 温度 / 默认模式 / 目标语言 / 机器翻译商 / top_k
保存：PATCH /research-settings（仅非空字段）→ 「已保存 ✓」
```

**验证**：触发逻辑（设置/settings/配置 命中、无关消息不触发）；GET/PATCH 端到端
（llm.baseUrl/defaultModel + knowledge.retrieveTopK 保存成功，测试数据已还原）；
boot 注入 7 个 research UI 条目。

**浏览器效果**：发送「打开设置」→ 设置面板出现，编辑后点「保存」。

## Phase 4：ui-research-literature v0.1（文献检索面板节点）✅ 2026-08-17

关键词触发（文献检索/搜文献/检索文献/literature/search paper）→ **检索面板**：
消息带查询词时自动预填并搜索（如「搜文献：gibbon」→ 面板自动检索 gibbon）。

```
新增端点：GET /research-paper/search?q=&limit=   （research-paper bundle）
  - user 作用域：title / authors / doi LIKE 查询，created_time DESC
面板：搜索框 + 检索按钮（Enter 可触发）→ 结果列表（标题/作者/年份/状态）
```

**验证**：search 端点真实查询（gibbon → 论文 51/50）；触发/查询词提取（搜文献：gibbon
→ query="gibbon"、无关消息不触发）；boot 注入 8 个 research UI 条目；node --check 通过。

**浏览器效果**：发送「搜文献：gibbon」→ 检索面板自动搜索并列出结果。

> **Phase 4 UI 清单全部落地（8 个包）**：hello 探针 + library/paper/citation/dashboard/
> writing/settings/literature 七个业务节点。`ui-research-assistant` 由 DSH 会话天然承担，
> 无需专门页面。下一步：Next.js 下线出口评估（Phase 5 联动）。

## Phase 4：ui-research-review v0.1（综述生成面板节点）✅ 2026-08-17

关键词触发（综述/文献综述/review，消息可带主题预填）→ **综述生成面板**：

```
主题输入 + 论文勾选列表（调 /research-paper/search 空 q 取用户近期论文，默认全选）
生成 → POST /research-review/generate {paperIds, topic} → taskId
轮询 → GET /research-review/:taskId（每 3s）→ SUCCESS 展示 Markdown 综述 / FAILED 显示错误
```

**验证**：触发/主题提取（「生成综述：Acoustic classification」→ topic 预填）；**真实端到端**
（task 8：PENDING→SUCCESS，真实综述含 Introduction）；论文选择数据源（空 q 返回 3 篇）。
**同时修复**：`/research-paper/search` 空 q 原来返回空，现改为返回近期论文列表（供面板选论文）。

**浏览器效果**：发送「生成综述：Acoustic classification of gibbon females」→ 面板预填主题、
列出论文（全选）→ 点「生成综述」→ 30-60s 后展示 Markdown 综述。

> **Phase 4 UI 共 9 包落地**：hello 探针 + library/paper/citation/dashboard/writing/
> settings/literature/review 八个业务节点。下一步：Next.js 下线出口评估（Phase 5 联动）。

## Phase 4：ui-research-upload v0.1（上传面板节点）✅ 2026-08-17

关键词触发（上传/upload/上传文献/上传论文）→ **上传面板**：

```
项目下拉（/research-project）+ 文件夹下拉（/research-folder 根目录，可选）+ PDF 文件选择
上传三步：
  ① POST /research-file/upload-url { fileName, contentType } → { url, fields.key }
  ② POST { url }（FormData: file + key）→ 文件存储
  ③ POST /research-paper/projects/:pid/papers { fileName, s3Key, folderId } → { id, PROCESSING }
     （MQ paper.analyze 已触发，ai-service 自动分析）
面板日志显示每步状态，最终展示 paper#id（PROCESSING）
```

**验证**：三步端点端到端（presign → 上传 → 建论文 paper 54 → 删除还原）；boot 注入
10 个 research UI 条目。

**浏览器效果**：发送「上传文献」→ 选项目 + 选 PDF → 「上传」→ 日志显示三步完成，
论文进入 AI 分析。

## Phase 4：ui-research-project v0.1（项目管理面板节点）✅ 2026-08-17

关键词触发（项目/项目管理/文件夹/目录）→ **项目 & 文件夹树管理面板**：

```
新建项目表单（名称/领域）→ POST /research-project
项目列表：名称/描述/领域 + 「文件夹」「删除项目」
每项目：文件夹树（GET /research-folder/projects/:pid/folders/tree 递归渲染）
        + 新文件夹输入 → POST /research-folder/folders + 每文件夹「删除」
```

**验证**：触发分离（项目/文件夹命中，检索/上传不触发）；CRUD 端到端（建项目/文件夹 →
树 → 删除 → DB 还原）；boot 注入 **11 个 research UI 条目**。

**浏览器效果**：发送「项目管理」→ 面板展示项目列表 + 文件夹树，可新建/删除。

> **Phase 4 UI 共 11 包，缺口清零**：hello 探针 + 10 个业务节点（library/paper/citation/
> dashboard/writing/settings/literature/review/upload/project）。下一步：Phase 4 出口评估
> （覆盖矩阵 + 下线步骤 + 回退方案）→ Next.js 下线。

## Phase 4 出口执行（Next.js 下线）✅ 2026-08-18

**动作**：① `dsh-gateway.sh start 3081` 恢复统一网关（此前 3081 无监听，ai-service 的 LLM/embedding 全链路已死）；
② `cd infra && docker compose --env-file ../.env --profile app stop frontend`（:3000 下线）。

**验证（全部通过）**：
- 网关 3081：chat 真实回复 + embeddings 2048 维（doubao-embedding-vision）
- ai-service 容器内真实 SDK：chat + embeddings 经网关正常
- `:3000` 连接拒绝；backend/ai-service/mysql/pg/rabbitmq/redis 正常
- 3080 GUI boot 清单 49 条目含 **11 个 research UI 包**；`/plugins/@researchos/ui-*/client.js` 200
- 3080 路由：public 200 / protected 401（鉴权生效）；真实 register→me→project→settings code 0（测试用户已删）
- 3080 → 网关 LLM 链路：`/research-writing/rewrite` polish 真实润色输出（测试用户已删）

**遗留**：~~当前 3080 GUI 为手动启动（无 RESEARCH_\* env）~~ → **已修复（2026-08-18）**：`dsh-gateway.sh start` 规范重启，
单实例合并驻 3080（pid 56141），`.env` 的 `OPENAI_BASE_URL`/`EMBEDDING_BASE_URL` 改为 3080 并重建 ai-service；
验证网关 chat/embeddings、MCP vector_search（env 注入 3080）、boot 11 UI 包、writing rewrite 全部通过；
**3081 网关实例已退役**。网关限流 + key 收口 `ctx.credentials` 仍为 Phase 1 遗留。

## 下一步（遗留）

- [ ] 网关限流（per-key QPS/并发）与 key 收口到 DSH `ctx.credentials`
- [ ] Phase 5：AI 管道迁入 DSH（MQ 下线前置）、可拔插全量回归、`Implementation/` 文档更新、合入 main

## Phase 5：research-ai-worker（AI 管道迁入 DSH）✅ 2026-08-18

**形态**：`dsh-plugins/research-ai-worker/`——ai-service AI 管道（paper.analyze / review.generate /
paper.delete）的 TS/Node 移植，直连 MySQL + PG，LLM/embedding 走统一网关 3080：

- `lib/parser.js`（pdf_parser.py 移植：章节切分 + 滑动窗口 512/64）、`lib/embed.js`（批量 10/1s/429 退避）、
  `lib/vector.js`（paper_chunk 写/余弦检索/删除）、`lib/card.js`（Paper Card，prompt 同源）、
  `lib/llm.js`（网关 + llmOverride 直连/回退）、`lib/analyze.js`（analyze/cleanup 全流程）、
  `lib/review.js`（RAG + 综述生成）
- `cli.js`：`node cli.js analyze|cleanup|review` 独立验证（免重启 dsh）；`index.js`：bundle 路由
  `POST /research-ai-worker/{analyze,cleanup,review}`（JWT 或 X-Internal-Token）

**验证（真实端到端）**：analyze → 47 chunks（与 Python 管道一致）→ PG 写入 → 真实 Card → READY；
review → 10300 字符 Markdown 综述（[P1] 引用）；cleanup → 删除成功。测试数据已还原。

**集成（env 门控）**：`research-paper` / `research-review` 在 `RESEARCH_AI_INLINE=1` 时改调 worker
（HTTP + X-Internal-Token），默认关保持 MQ 管道。切换 = `dsh plugin add research-ai-worker` +
设 env + 重启（见 plan.md Phase 5）。**已知问题**：research-file legacy 代理大文件偶发截断
（worker 已 backend 直连优先规避；代理补丁随 GUI PDF 查看器处理）。

## 下一步（遗留）
