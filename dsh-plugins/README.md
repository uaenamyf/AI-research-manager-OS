# dsh-plugins — ResearchOS 的 DSH 插件包

本目录存放 ResearchOS 融入 DeepSeek Harness 的自研插件包（out-of-tree bundle，
通过 `dsh plugin` 装进 profile，不进 DSH 官方仓库）。

> 注意：`deepseek-harness-master/` 整个目录已被 .gitignore 忽略（第三方源码 + 构建产物 + 日志），
> 本目录只放**自研**代码。

## 包清单

| 包 | 状态 | 说明 |
| --- | --- | --- |
| `research-hello` | ✅ Phase 0 已验证 | 最小 bundle：可拔插闭环证明（插件 + HTTP 路由） |

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

> 默认端口 3080 被正式 GUI 占用时，用 `--patch <overlay.yml>` 把 webserver 端口覆盖到空闲端口
> （overlay 内容：`- id: webserver` + `config: {host: '127.0.0.1', port: 3081}`）。

## 包结构规范（照抄 DSH `packages/bundle/*` 形态）

- `package.json`：`dsh.bundle.patch` 指向 `cordis.patch.yml`；`type: module`；peerDependencies 声明 `@deepseek-ai/cordis`
- `cordis.patch.yml`：`- insert:` 行，`{id, name}` 挂插件（name 是本包名，自挂载）
- `index.js`：`export const name` + `export const inject` + `export function apply(ctx)`（Cordis 插件形态）

## 下一步（Phase 0 剩余）

- [ ] `research-mcp`：最小 stdio MCP server（文献检索工具）→ `dsh-mcp-client` 连接验证
- [ ] `dsh-llm-gateway` spike：`ctx.webServer` 注册 `/v1/chat/completions` + `/v1/embeddings`，转发 `ctx.llm.stream()`
- [ ] 数据层 spike：bundle 用 mysql2/pg 连现有 MySQL/PG
