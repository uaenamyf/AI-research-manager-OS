# Literature Search MCP：打包、分发与安装指南

本文介绍如何把 `literature-search-mcp` 打包成 ZIP 发给其他人，以及接收者如何在 Claude Code 中安装和使用它。

> 推荐分发“源码 ZIP”：不包含 `node_modules/` 和本机路径，接收者通过锁定的 `package-lock.json` 安装依赖并在自己的系统上构建。这比直接复制 `node_modules/` 更安全、体积更小，也更兼容不同操作系统。

## 1. 功能概览

这个 MCP 通过 stdio 向 Claude Code 提供两个工具：

- `literature_search`：并行检索并聚合 PubMed、Europe PMC、bioRxiv/medRxiv、Crossref、OpenAlex、Semantic Scholar 和 arXiv。
- `literature_sources`：列出来源能力、局限和可选凭据状态。

它返回论文元数据、标识符、摘要或摘要片段及链接，不下载全文，也不遍历引用网络。

## 2. 接收者的环境要求

接收者需要安装：

1. **Node.js 22 或更高版本**
2. **npm**
3. **Claude Code**
4. 能访问所选学术数据库 API 的网络

检查版本：

```bash
node --version
npm --version
claude --version
```

Node.js 应显示 `v22.x.x` 或更高版本。

---

# 第一部分：发送者如何打包

## 3. 推荐方式：源码 ZIP

进入 `literature-search-mcp` 的上级目录：

```bash
cd /path/to/parent-directory
```

在 Linux 或 macOS 中创建 ZIP：

```bash
zip -r literature-search-mcp-source-v1.0.0.zip literature-search-mcp \
  -x 'literature-search-mcp/node_modules/*' \
     'literature-search-mcp/dist/*' \
     'literature-search-mcp/.test-dist/*' \
     'literature-search-mcp/.env' \
     'literature-search-mcp/*.log'
```

源码 ZIP 应至少包含：

```text
literature-search-mcp/
├── src/
├── test/
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.test.json
├── README.md
├── INSTALL_ZH.md
├── PROVIDERS.md
├── LICENSE
└── NOTICE
```

不要发送：

- `node_modules/`
- `.env`
- API Key
- 本地查询历史
- `.test-dist/`
- 旧的临时构建文件

查询历史默认位于用户目录下，不在项目内：

```text
~/.local/state/literature-search-mcp/history.jsonl
```

### 3.1 生成校验和

建议同时生成 SHA-256 校验和：

```bash
sha256sum literature-search-mcp-source-v1.0.0.zip \
  > literature-search-mcp-source-v1.0.0.zip.sha256
```

把 ZIP 和 `.sha256` 文件一起发送。接收者可以运行：

```bash
sha256sum -c literature-search-mcp-source-v1.0.0.zip.sha256
```

macOS 如果没有 `sha256sum`，可以运行：

```bash
shasum -a 256 literature-search-mcp-source-v1.0.0.zip
```

## 4. 可选方式：预构建 ZIP

预构建 ZIP 适合不想让接收者安装 TypeScript 开发依赖的情况。接收者仍需要运行 `npm ci --omit=dev` 安装 MCP SDK 等运行时依赖。

发送者先构建并测试：

```bash
cd /path/to/literature-search-mcp
npm ci
npm test
npm run typecheck
npm run build
```

然后创建一个发布目录，仅放入运行所需文件和文档：

```bash
mkdir -p release/literature-search-mcp
cp -r dist package.json package-lock.json \
  README.md INSTALL_ZH.md PROVIDERS.md LICENSE NOTICE \
  release/literature-search-mcp/

cd release
zip -r literature-search-mcp-prebuilt-v1.0.0.zip literature-search-mcp
```

预构建 ZIP 应包含：

```text
literature-search-mcp/
├── dist/
│   ├── server.js
│   └── cli.js
├── package.json
├── package-lock.json
├── README.md
├── INSTALL_ZH.md
├── PROVIDERS.md
├── LICENSE
└── NOTICE
```

不要直接打包 `node_modules/`。它体积大，可能包含与发送者操作系统或 CPU 环境相关的内容，而且不利于接收者审计依赖。

---

# 第二部分：接收者如何安装

## 5. 解压到一个永久目录

MCP 注册后，Claude Code 会长期引用 `dist/server.js` 的绝对路径。因此不要解压到临时目录，也不要在注册后随意移动该文件夹。

Linux/macOS 示例：

```bash
mkdir -p ~/tools
unzip literature-search-mcp-source-v1.0.0.zip -d ~/tools
cd ~/tools/literature-search-mcp
```

Windows PowerShell 示例：

```powershell
New-Item -ItemType Directory -Force "$HOME\tools" | Out-Null
Expand-Archive .\literature-search-mcp-source-v1.0.0.zip -DestinationPath "$HOME\tools"
Set-Location "$HOME\tools\literature-search-mcp"
```

## 6. 安装源码 ZIP

如果收到的是源码 ZIP：

```bash
npm ci
npm run typecheck
npm test
npm run build
```

验证构建入口存在：

Linux/macOS：

```bash
test -f dist/server.js && echo 'build OK'
```

Windows PowerShell：

```powershell
Test-Path .\dist\server.js
```

`npm ci` 会严格按 `package-lock.json` 安装依赖。第一次安装时会从 npm 注册表下载第三方软件包，接收者应先检查 `package.json`、`package-lock.json`、`LICENSE` 和 `NOTICE`。

## 7. 安装预构建 ZIP

如果收到的是预构建 ZIP，不需要 TypeScript 编译器，只安装生产依赖：

```bash
npm ci --omit=dev
```

验证：

```bash
node dist/server.js
```

正常情况下，这个命令会启动 stdio MCP 并等待客户端输入，不会出现普通交互界面。按 `Ctrl+C` 退出即可。

> 预构建包不要运行 `npm run build`，因为其中可能不包含 `src/`、测试和 TypeScript 开发依赖。

---

# 第三部分：注册到 Claude Code

## 8. 用户级全局注册（推荐）

用户级注册后，MCP 在该用户的所有 Claude Code 项目中可用。

### 8.1 Linux/macOS

在解压后的项目目录中运行：

```bash
NODE_PATH="$(command -v node)"
SERVER_PATH="$(pwd)/dist/server.js"

claude mcp add --scope user --transport stdio literature-search -- \
  "$NODE_PATH" "$SERVER_PATH"
```

### 8.2 Windows PowerShell

```powershell
$NodePath = (Get-Command node).Source
$ServerPath = (Resolve-Path .\dist\server.js).Path

claude mcp add --scope user --transport stdio literature-search -- `
  $NodePath $ServerPath
```

### 8.3 检查连接状态

```bash
claude mcp get literature-search
claude mcp list
```

成功时应看到类似：

```text
literature-search: ... - Connected
```

如果当前已经打开了 Claude Code 会话，请退出并重新启动，让新 MCP 工具加载到会话中。

## 9. 仅对一个项目启用

如果不希望全局启用，可以在目标项目中执行：

```bash
claude mcp add --scope local --transport stdio literature-search -- \
  /absolute/path/to/node \
  /absolute/path/to/literature-search-mcp/dist/server.js
```

`local` 是当前机器、当前项目范围。不要把包含个人绝对路径的配置直接提交给其他人。

## 10. 可选：允许 Agent 无提示调用

默认情况下，Claude Code 可能在首次调用 MCP 工具时请求批准。接收者如果希望所有项目中的 Agent 无提示调用，可把以下规则**合并**到用户级 `~/.claude/settings.json`：

```json
{
  "permissions": {
    "allow": [
      "mcp__literature-search__literature_sources",
      "mcp__literature-search__literature_search"
    ]
  }
}
```

Windows 对应路径通常是：

```text
%USERPROFILE%\.claude\settings.json
```

注意：

- 必须保留该文件中原有的设置和权限，不能用上面的片段覆盖整个文件。
- `literature_search` 会按设计把查询参数和结果标识写入本地 JSONL 历史。
- 如果不希望永久授权，可以保持默认设置，在每次出现权限提示时手动批准。

## 11. 可选：让 Claude 优先使用文献 MCP

可把以下规则追加到用户级 `~/.claude/CLAUDE.md`：

```markdown
## Academic literature search

For academic paper discovery and structured scholarly metadata, prefer the
`literature-search` MCP tools. Use `literature_search` first. Use WebSearch only
when the MCP is unavailable, relevant sources fail, results are inadequate, or
ordinary web discovery is required. State briefly when falling back to WebSearch.
```

这只影响工具选择策略，不会禁止 WebSearch。

---

# 第四部分：使用示例

## 12. 自然语言使用

在 Claude Code 中直接输入：

```text
搜索 2020–2026 年关于 MYH7 与肥厚型心肌病的论文。
使用结构化学术来源，返回 DOI、PMID、摘要和链接。
```

```text
使用 literature_search 搜索 TTN truncating variants 与扩张型心肌病，
限制在 PubMed、Europe PMC 和 OpenAlex，返回 10 篇论文。
```

```text
只搜索开放获取的 CRISPR 心肌病基因编辑论文，年份为 2022–2026，
最多返回 5 篇，并报告哪些数据库失败或限流。
```

## 13. 参数示例

Claude 调用 `literature_search` 时对应的参数类似：

```json
{
  "query": "MYH7 hypertrophic cardiomyopathy genetics",
  "limit": 10,
  "sources": ["pubmed", "europepmc", "openalex"],
  "year_from": 2020,
  "year_to": 2026,
  "open_access": false
}
```

支持的来源 ID：

```text
pubmed
europepmc
biorxiv
crossref
openalex
semantic-scholar
arxiv
```

## 14. 查看来源能力

在 Claude Code 中输入：

```text
调用 literature_sources，列出可用数据库、限制和可选配置。
```

---

# 第五部分：可选 API 配置

## 15. 无 Key 也可以使用

MCP 默认可以无 API Key 启动。以下环境变量是可选的：

```text
OPENALEX_MAILTO
OPENALEX_API_KEY
SEMANTIC_SCHOLAR_API_KEY
CROSSREF_MAILTO
NCBI_TOOL
NCBI_EMAIL
NCBI_API_KEY
```

Linux/macOS 临时设置示例：

```bash
export CROSSREF_MAILTO='researcher@example.org'
export NCBI_EMAIL='researcher@example.org'
export OPENALEX_API_KEY='...'
claude
```

Windows PowerShell 临时设置示例：

```powershell
$env:CROSSREF_MAILTO = 'researcher@example.org'
$env:NCBI_EMAIL = 'researcher@example.org'
$env:OPENALEX_API_KEY = '...'
claude
```

MCP 子进程会继承启动 Claude Code 时的环境变量。

不要把真实 API Key 写入：

- ZIP 文件
- `README.md`
- `CLAUDE.md`
- Git 仓库
- 聊天提示词

---

# 第六部分：历史、隐私与维护

## 16. 查询历史

默认历史位置：

Linux/macOS：

```text
~/.local/state/literature-search-mcp/history.jsonl
```

如果设置了 `XDG_STATE_HOME`，则使用：

```text
$XDG_STATE_HOME/literature-search-mcp/history.jsonl
```

历史包含查询词、筛选参数、来源状态、论文标识符、排名和 URL，不包含摘要、作者或 API Key。

清空历史：

```bash
cd /path/to/literature-search-mcp
node dist/cli.js clear-history
```

源码安装也可以使用：

```bash
npm run history:clear
```

## 17. 更新版本

接收者收到新 ZIP 后，建议：

1. 解压到新的版本目录；
2. 运行 `npm ci` 和构建/测试；
3. 移除旧注册；
4. 用新目录的绝对路径重新注册；
5. 验证连接后再删除旧目录。

```bash
claude mcp remove --scope user literature-search
claude mcp add --scope user --transport stdio literature-search -- \
  /absolute/path/to/node \
  /absolute/path/to/new-version/dist/server.js
claude mcp list
```

---

# 第七部分：故障排查

## 18. `claude mcp list` 显示连接失败

依次检查：

```bash
node --version
ls -l /absolute/path/to/literature-search-mcp/dist/server.js
node /absolute/path/to/literature-search-mcp/dist/server.js
```

常见原因：

- Node.js 低于 22；
- 没有执行 `npm ci`；
- 源码 ZIP 没有执行 `npm run build`；
- MCP 注册后移动了项目目录；
- 注册路径是相对路径而不是绝对路径；
- Node 由版本管理器安装，升级或删除版本后原绝对路径失效；
- 企业网络阻止了部分学术数据库。

重新注册：

```bash
claude mcp remove --scope user literature-search
# 然后重新执行第 8 节中的注册命令
```

## 19. 搜索只有部分数据库结果

查看 `source_statuses`：

- `ok`：查询成功并有结果；
- `empty`：查询成功但没有匹配；
- `rate_limited`：数据库限流；
- `timeout`：请求超时；
- `error`：数据库或解析错误。

单个数据库失败不会让整个搜索失败。可以缩小 `sources`、降低 `limit`、稍后重试，或配置对应的可选 API Key。

## 20. Agent 不调用 MCP

1. 确认 `claude mcp list` 显示 `Connected`；
2. 重新启动 Claude Code 会话；
3. 明确输入“使用 `literature_search`”；
4. 检查是否批准了 MCP 工具权限；
5. 如需自动优先调用，配置第 11 节的全局规则。

## 21. npm 安装失败

可能原因包括代理、证书、npm 注册表不可达或 Node 版本错误。检查：

```bash
npm config get registry
npm ping
npm ci
```

如果使用单位代理或内部 npm 镜像，应由接收者按其组织要求配置，不要把个人代理凭据打进 ZIP。

---

# 第八部分：卸载

## 22. 从 Claude Code 移除

```bash
claude mcp remove --scope user literature-search
claude mcp list
```

然后可选择：

1. 先运行 `node dist/cli.js clear-history` 清除查询历史；
2. 删除解压后的项目目录；
3. 手动删除 `~/.claude/CLAUDE.md` 中添加的 MCP 优先规则；
4. 手动删除 `~/.claude/settings.json` 中对应的两个允许规则。

不要直接删除项目目录后保留 MCP 注册，否则 Claude Code 会持续显示连接失败。

---

# 快速安装清单

接收者使用源码 ZIP 时，最短流程如下：

```bash
unzip literature-search-mcp-source-v1.0.0.zip
cd literature-search-mcp
npm ci
npm test
npm run build

NODE_PATH="$(command -v node)"
SERVER_PATH="$(pwd)/dist/server.js"
claude mcp add --scope user --transport stdio literature-search -- \
  "$NODE_PATH" "$SERVER_PATH"

claude mcp list
```

然后重新打开 Claude Code并输入：

```text
使用 literature_search 搜索 2020–2026 年关于 MYH7 心肌病遗传学的论文，
返回 5 篇，包含 DOI、PMID、摘要和链接。
```
