# Backend 模块规范

> 本文件约束 `backend/` 目录下的所有开发。配合根 `CLAUDE.md` 与 `Implementation/20-backend.md` 使用。

## 服务定位

- **角色**：后端工程师。
- **技术栈**：Spring Boot 3.3 + Java 21 + MyBatis-Plus + Spring Security。
- **职责**：认证授权、业务表 CRUD、文件上传编排、任务下发与回调接收。

## 铁律（禁止事项）

1. ❌ **禁止实现 AI/LLM/向量逻辑**：PDF 解析、embedding、LLM 调用一律交给 ai-service。backend 只做编排与回调。
2. ❌ **禁止直连 ai-service 的内部端点做前端暴露**：backend 调 ai-service 必须带 `X-Internal-Token`，且不把 ai-service 响应原样透传敏感信息给前端。
3. ❌ **禁止 service 查询不带 user_id**：所有业务数据查询必须 `WHERE user_id = ?`，禁止「按 id 查询但不校验归属」。
4. ❌ **禁止中转文件流**：PDF 上传用 Pre-signed POST 让前端直传 S3，backend 不经手文件内容。

## 目录职责

采用**扁平包结构**（按角色而非业务域组织），所有 controller/service/mapper/entity/dto 各放一个包：

```
src/main/java/com/researchos/
├── controller/    # 所有 REST 端点（16个 Controller）
├── service/       # 所有业务逻辑（13个 Service）
├── mapper/        # 所有 MyBatis-Plus 数据访问（7个 Mapper）
├── entity/        # 所有数据库实体（6个 Entity）
├── dto/           # 所有请求/响应 DTO（18个 DTO）
├── security/      # JWT、UserPrincipal、CurrentUserResolver
├── config/        # SecurityConfig、RabbitConfig、MybatisPlusConfig、AppProperties、WebConfig
├── common/        # 统一响应 ApiResponse、全局异常、分页（common.response / common.exception）
└── ResearchOsApplication.java
```

> 扁平结构的好处：目录少、找文件快，适合单人开发。业务域通过类名前缀区分（如 `PaperService`/`ProjectService`）。

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
