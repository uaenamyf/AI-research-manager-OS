# 20 - 后端实现（Spring Boot）

## 融合现状（2026-08-19）

> **legacy backend（Spring Boot :8080）已于 2026-08-19 移除**（AI 管道迁入 DSH `research-ai-worker`，业务由 research-* bundle 承担；源码在 git 历史 `HEAD:backend/` 可回退）。
> 下方原内容为 legacy 契约/结构描述，仅作历史参考，不再对应运行代码。

### 替代映射（backend → research-* bundle）

| 原控制器/模块 | 替代 bundle | 说明 |
| --- | --- | --- |
| AuthController / SecurityConfig(JWT) | `research-auth` | 共享同一 `JWT_SECRET`（HS256，`sub/email/plan/iat/exp` + bcrypt 同款），token 与旧后端互通的历史契约保留 |
| ProjectController / FolderController / PaperController / FileController | `research-project` / `research-folder` / `research-paper` / `research-file` | 文献域 4 bundle，直连 MySQL |
| WritingController / ReviewController（+ ai-service writing_agent · review_agent · paper_agent） | `research-writing` / `research-review` / `research-paper-card` | AI 域 3 bundle，LLM 走共享网关，解析/嵌入走 research-ai-worker |
| ExportController / CitationController | `research-export` | 导出/引用渲染与后端逐字节一致 |
| SettingsController / SubscriptionController | `research-settings` / `research-subscription` | 用户设置 / Stripe 订阅 |
| RabbitMQ 任务下发/回调 | research-ai-worker inline（`RESEARCH_AI_INLINE=1`） | MQ 已随 Phase 5 下线 |

> 完整下线映射见根 `plan.md`「Phase 3 出口映射表」；bundle 实现细节见 `deepseek-harness-master/packages/researchos/`。
> 融合权威文档：根 `plan.md`（融合方案）+ `deepseek-harness-master/packages/researchos/`（bundle 实现记录）。

> 注：以下为 legacy 描述（backend 已移除，仅作历史参考）。

## 目录结构

采用**扁平包结构**（按角色而非业务域组织）：

```
backend/
├── src/main/java/com/researchos/
│   ├── ResearchOsApplication.java   # 应用入口（@MapperScan("com.researchos.mapper")）
│   ├── controller/     # 所有 REST 端点（8个）
│   ├── service/        # 所有业务逻辑（9个）
│   ├── mapper/         # 所有 MyBatis-Plus 数据访问（5个）
│   ├── entity/         # 所有数据库实体（5个）
│   ├── dto/            # 所有请求/响应 DTO（14个）
│   ├── security/       # JWT、UserPrincipal、CurrentUserResolver
│   ├── config/         # SecurityConfig、RabbitConfig、MybatisPlusConfig、AppProperties、WebConfig
│   └── common/         # 统一响应（common.response）/ 异常（common.exception）
├── src/main/resources/
│   ├── application.yml
│   └── db/
│       ├── migration-mysql/   # MySQL 业务表 DDL（V1__init.sql，手工执行）
│       └── migration/         # 旧 PG 迁移（Flyway 已禁用，保留参考）
└── pom.xml
```

> 扁平结构的好处：目录少、找文件快，适合单人开发。业务域通过类名前缀区分。
> **双库**：业务数据存 MySQL（唯一数据源），向量存 PG（ai-service 维护）。Flyway 已禁用，schema 手工执行。

## 关键组件

### 统一响应

```java
public record ApiResponse<T>(int code, String message, T data) {
    public static <T> ApiResponse<T> ok(T data) { return new ApiResponse<>(0, "ok", data); }
    public static <T> ApiResponse<T> fail(int code, String msg) { return new ApiResponse<>(code, msg, null); }
}
```

### 全局异常处理

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) { ... }
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleDenied(AccessDeniedException e) { ... }
}
```

### AI 任务下发（异步）

```java
// backend 发消息到 RabbitMQ exchange=researchos.ai.task
public void dispatchPaperAnalysis(Long paperId) {
    rabbitTemplate.convertAndSend("researchos.ai.task", "paper.analyze",
        new AiTaskMessage(paperId, "PAPER_ANALYSIS"));
}
```
