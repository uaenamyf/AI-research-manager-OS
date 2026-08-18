# 95 - 测试策略

## 各层测试工具与范围

| 层 | 工具 | 范围 |
| --- | --- | --- |
| 前端 | Vitest + React Testing Library | 组件单元、hook |
| 前端 E2E | Playwright | 关键用户流程 |
| 后端 | JUnit 5 + Mockito | service 单元、controller MockMvc |
| 后端集成 | Testcontainers（PG/Redis/Rabbit） | repository、MQ 消费 |
| ai-service | pytest + httpx | API、agent 逻辑（mock LLM） |
| LLM 回归 | 录制 fixture，离线对比 | 防止 prompt 改动劣化 |

## ai-service 测试要点

- **LLM 调用必须可 mock**，CI 不消耗真实 token。
- 用 fixture 固化 PDF 解析与检索结果。
- MockSDKModel 返回纯文本不触发工具调用，handoff 链需回退手动链（见 AGENTS.md §8.3）。

## 测试要求

- 新增功能 PR 必须带对应测试，否则不予合并。
- 契约双方都要有对应测试：backend 测调用、ai-service 测接收。

## 融合现状（2026-08-18）：DSH bundle 验证实践

> legacy 三服务测试策略（上表）保留不变，仍适用于在跑的 backend / ai-service 与 frontend 回退场景。
> 融合新增的 DSH bundle / MCP / UI 包验证以 `dsh-plugins/README.md` 为权威（每 bundle 均有端到端验证记录）。

- **验证即文档**：每个 `research-*` bundle、`research-mcp`、`ui-research-*` 包的验证结论（端点、正负例、真实链路、boot 注入条目数）记录在 `dsh-plugins/README.md` 对应 Phase 章节；改动 bundle 后需同步更新该文件。
- **可拔插回归（融合验收项）**：`dsh plugin --profile web remove|add <包>` + 重启 DSH，验证卸载后其余 bundle 正常、对应路由回落 SPA fallback，重装后功能恢复（已实测：卸载 `research-folder` 后 auth / project / paper / export / subscription 全部正常）。
- **测试数据还原约定**：UI 面板端到端验证产生的数据验证后须清理还原（如 settings 保存、上传建论文 paper、项目/文件夹 CRUD、注册的测试用户均删除还原），保持 MySQL / PG 数据健康。
- **LLM / 网关验证**：chat / embeddings 经共享网关走真实上游（不 mock）；验证命令与预期（如 2048 维向量、boot 49 条目含 11 个 UI 包）见 `dsh-plugins/README.md`。
- **双库一致性**：孤儿 chunk 清理经正规契约通道（向 researchos.ai.task 发 paper.delete 由 ai-service 消费）执行，不直接手改 PG（见 plan.md「Phase 5 数据核对结果」）。
