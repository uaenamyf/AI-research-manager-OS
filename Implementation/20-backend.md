# 20 - 后端实现（Spring Boot）

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

### Paper Chat SSE 转发

```java
@GetMapping(value = "/papers/{id}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter chatStream(@PathVariable Long id, @RequestParam String q) {
    SseEmitter emitter = new SseEmitter(60_000L);
    // 调用 ai-service 的 /rag/chat/stream，转发 token
    chatService.forwardStream(id, q, emitter);
    return emitter;
}
```
