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
