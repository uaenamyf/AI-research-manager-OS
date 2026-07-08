# Backend 模块规范

> 本文件约束 `backend/` 目录下的所有开发。配合根 `CLAUDE.md` 与 `Implementation/20-backend.md` 使用。

## 服务定位

- **角色**：后端工程师。
- **技术栈**：Spring Boot 3.3 + Java 21 + MyBatis-Plus + Spring Security。
- **职责**：认证授权、业务表 CRUD、文件上传编排、任务下发与回调接收、SSE 转发。

## 铁律（禁止事项）

1. ❌ **禁止实现 AI/LLM/向量逻辑**：PDF 解析、embedding、LLM 调用一律交给 ai-service。backend 只做编排与回调。
2. ❌ **禁止直连 ai-service 的内部端点做前端暴露**：backend 调 ai-service 必须带 `X-Internal-Token`，且不把 ai-service 响应原样透传敏感信息给前端。
3. ❌ **禁止 service 查询不带 user_id**：所有业务数据查询必须 `WHERE user_id = ?`，禁止「按 id 查询但不校验归属」。
4. ❌ **禁止中转文件流**：PDF 上传用 Pre-signed POST 让前端直传 S3，backend 不经手文件内容。

## 目录职责

```
src/main/java/com/researchos/
├── config/          # SecurityConfig、RedisConfig、RabbitConfig、CorsConfig
├── common/          # 统一响应 ApiResponse、全局异常、分页
├── user/            # 用户 CRUD（controller/service/mapper/entity/dto）
├── auth/            # JWT、OAuth、登录注册
├── project/         # Research Project CRUD
├── paper/           # 论文 CRUD + 状态管理
├── file/            # S3 上传、signed URL 签发
├── aitask/          # AI 任务下发到 MQ + 接收 ai-service 回调
├── chat/            # Paper Chat，转发 ai-service SSE 流
└── subscription/    # Stripe 订阅、额度校验
```

## 模块分层约定（每个业务模块统一）

```
xxx/
├── controller/   # REST 端点，只做参数校验与调度，不含业务逻辑
├── service/       # 业务逻辑，所有查询带 userId
├── mapper/        # MyBatis-Plus 数据访问
├── entity/        # 数据库实体
└── dto/           # 请求/响应 DTO
```

## 关键约定

### 统一响应

所有对外接口返回 `{ code, message, data }`，`code=0` 表示成功：

```java
public record ApiResponse<T>(int code, String message, T data) {
    public static <T> ApiResponse<T> ok(T data) { return new ApiResponse<>(0, "ok", data); }
}
```

### 异步任务下发

```java
rabbitTemplate.convertAndSend("researchos.ai.task", "paper.analyze",
    new AiTaskMessage(paperId, "PAPER_ANALYSIS"));
```

### SSE 转发（Paper Chat）

backend 转发 ai-service 的流式响应，不缓存内容：

```java
@GetMapping(value = "/papers/{id}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter chatStream(@PathVariable Long id, @RequestParam String q) { ... }
```

### 内部回调端点

ai-service 回调的端点统一放 `/internal/*`，用 `X-Internal-Token` 校验，不对外暴露：

- `PATCH /internal/paper/{id}/result`
- `PATCH /internal/task/{id}/result`

## 文件头与命名

- Java 文件用类级 Javadoc（`@author`、`@since`），不用 `# date` 风格。
- 类名 `PascalCase`，方法/变量 `camelCase`。
- 数据库迁移脚本放 `src/main/resources/db/migration/V{n}__{desc}.sql`。

## 测试

- service 层必须有 JUnit 5 + Mockito 单元测试。
- controller 用 MockMvc。
- 集成测试用 Testcontainers（PG/Redis/Rabbit）。
- 契约测试：调用 ai-service 的逻辑必须有 mock 测试。
