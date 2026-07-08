# 20 - 后端实现（Spring Boot）

## 目录结构

```
backend/
├── src/main/java/com/researchos/
│   ├── ResearchOsApplication.java
│   ├── config/              # SecurityConfig、RedisConfig、RabbitConfig、CorsConfig
│   ├── common/              # 统一响应、异常处理、分页
│   ├── user/                # entity / mapper / service / controller
│   ├── auth/                # JWT、OAuth、登录注册
│   ├── project/
│   ├── paper/               # paper CRUD
│   ├── file/                # S3 上传、signed URL
│   ├── aitask/              # AI 任务下发与回调
│   ├── chat/                # Paper Chat（转发 ai-service，SSE）
│   └── subscription/        # Stripe、额度校验
├── src/main/resources/
│   ├── application.yml
│   ├── mapper/              # MyBatis XML
│   └── db/migration/        # Flyway 迁移脚本 V1__init.sql
└── pom.xml
```

## 模块分层约定（每个业务模块统一）

```
xxx/
├── controller/   # REST 端点，只做参数校验与调度
├── service/       # 业务逻辑
├── mapper/        # MyBatis-Plus 数据访问
├── entity/        # 数据库实体
└── dto/           # 请求/响应 DTO
```

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
