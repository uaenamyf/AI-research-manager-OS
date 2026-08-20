# AI-research-manager-OS（已迁移 → 单仓库）

> ⚠️ **本仓库已废弃**（2026-08-22）。全部代码与文档已迁移到单一仓库：

## 🔗 新仓库：https://github.com/uaenamyf/dsh-researchOS

- 这是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
  的 fork，`packages/researchos/` 承载全部 ResearchOS AI 能力：
  PDF 解析、RAG 问答、文献综述、写作助手、统一 LLM 网关、research-mcp。
- **零外部数据库、零 Docker、clone 即用**（SQLite-only，`node:sqlite`）。
- 使用方式见新仓库根 README 与 `packages/researchos/README.md`。

```sh
git clone https://github.com/uaenamyf/dsh-researchOS.git
cd dsh-researchOS
pnpm install
cp packages/researchos/.env.example packages/researchos/.env   # 填 OPENAI_API_KEY
make -C packages/researchos start-dsh                          # → http://localhost:3080
```

本仓库历史提交（`dev` 分支）保留作存档；本地目录 `deepseek-harness-master/`
是迁移后的工作副本（原 submodule 已解绑，不再跟踪）。
