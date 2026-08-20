# 95 - 测试策略

## 融合现状（2026-08-19）：DSH 融合包验证实践

> legacy 三服务测试策略（下表）已随 backend / ai-service 移除（2026-08-19）仅作历史参考；
> 当前验证以 DSH 融合包为主，见根 `TESTING.md` 与 `deepseek-harness-master/packages/researchos/`（每 bundle 均有端到端验证记录）。

- **验证即文档**：每个 `research-*` bundle、`research-mcp`、`ui-research-*` 包的验证结论（端点、正负例、真实链路、boot 注入条目数）记录在 `deepseek-harness-master/packages/researchos/` 对应 Phase 章节；改动 bundle 后需同步更新。
- **可拔插回归（融合验收项）**：`dsh plugin --profile web remove|add <包>` + 重启 DSH，验证卸载后其余 bundle 正常、重装后功能恢复（已实测：卸载 `research-folder` 后 auth / project / paper / export / subscription 全部正常）。
- **测试数据还原约定**：UI 面板端到端验证产生的数据验证后须清理还原（如 settings 保存、上传建论文 paper、项目/文件夹 CRUD、注册的测试用户均删除还原），保持 SQLite 数据健康。
- **LLM / 网关验证**：chat / embeddings 经共享网关走真实上游（不 mock）；验证命令与预期（如 2048 维向量、boot 49 条目含 11 个 UI 包）见根 `TESTING.md`。
- **向量数据一致性**：孤儿 chunk 清理经正规契约通道（research-paper 删除论文 → research-ai-worker 清理 SQLite `paper_chunk`）执行，不直接手改库（见 plan.md「Phase 5 数据核对结果」）。

## 各层测试工具与范围（legacy，已随服务移除）

| 层 | 工具 | 范围 |
| --- | --- | --- |
| 后端 | JUnit 5 + Mockito | service 单元、controller MockMvc |
| 后端集成 | Testcontainers（PG/Redis/Rabbit） | repository、MQ 消费 |
| ai-service | pytest + httpx | API、agent 逻辑（mock LLM） |
| LLM 回归 | 录制 fixture，离线对比 | 防止 prompt 改动劣化 |
| DSH 客户端包 | DSH GUI 手动验证（`deepseek-harness-master/packages/researchos/` 记录） | 聊天节点 / bundle 路由 / 可拔插 |

> 历史注：legacy 服务测试要求（如下）已随服务移除；融合包 LLM 相关改动保持可 mock、CI 不消耗真实 token（见根 `CLAUDE.md` §8）。

- **LLM 调用必须可 mock**，CI 不消耗真实 token。
- 用 fixture 固化 PDF 解析与检索结果。
- MockSDKModel 返回纯文本不触发工具调用，handoff 链需回退手动链（见 AGENTS.md §8.3）。
