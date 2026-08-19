# 80 - 认证与多租户隔离

## 融合现状（2026-08-19）

> 认证与隔离由 DSH bundle（`research-auth` 等）承载。legacy Spring Boot 已于 2026-08-19
> 移除；其与 bundle 共享同一套 JWT 体系的历史契约已归档（token 双向互通不再有对端）。
> 本节为当前生效的安全模型；下方各节为 legacy 描述，保留作回退基线。

### 认证（research-auth bundle）

- `research-auth` bundle 签发/验签 JWT：HS256，Payload `sub/email/plan/iat/exp`（与 legacy
  Spring Boot 同款结构，`JWT_SECRET` 单一来源为仓库根 `.env`，经 `scripts/dsh-gateway.sh` 注入）。
- **bundle 内联 JWT 验签**：每个受保护路由内联解析 JWT，并校验 subject 对应的 `app_user` 仍存在；
  支持 httpOnly cookie 与 `Authorization: Bearer` 双通道。
- 负例已验：错密码 401、重复邮箱 400、无 token / 坏 token 401、短密码 400。

### 数据隔离（bundle 强制）

- **所有 bundle 查询强制 `user_id` 过滤**：project / folder / paper / review / settings /
  export 等一律 `WHERE user_id = ?`，跨用户访问统一返回 **404**（不泄露资源存在性）。
- 创建时额外校验归属：如 research-folder 建文件夹时校验项目归属 + 父文件夹归属。

### 文件安全（research-file 本地存储）

- 存储目录 `~/.researchos/uploads`（`RESEARCH_STORAGE_LOCAL_DIR`），key 布局
  `papers/{uuid}/{fileName}`。
- **路径穿越防护**：`resolveKey` 强制 key 落在 uploadDir 内。
- 下载支持全量 / Range(206)，需 JWT（或内部 token）。
- S3 分支未实现（当前 `STORAGE_TYPE=local`）。

### 内部服务鉴权与密钥收口

- bundle 间内部调用与兜底代理：`X-Internal-Token`（`INTERNAL_TOKEN`）。
- **网关 key 单点收口**：LLM/embedding 上游 key 只存在于仓库根 `.env`，由 `scripts/dsh-gateway.sh`
  启动时注入网关环境（`RESEARCH_LLM_API_KEY` 等），请求侧 key 不校验；**未来收口到 DSH
  `ctx.credentials`**（遗留项）。
- JWT secret 从 `.env` 的 `JWT_SECRET` 读取，不硬编码。

> ⚠️ 过时注（2026-08-19）：下方「双认证（bundle ⇄ Spring Boot）」与「旧后端代理兜底」小节为
> legacy 描述（backend 已移除），仅作历史参考。

## JWT

> ⚠️ 过时注（2026-08-18）：backend 现行 JWT 为 HS256 共享 `JWT_SECRET`，Payload 同款
> `sub/email/plan/iat/exp`（与 bundle 一致）；Refresh Token / Redis 未使用（Redis 0 key），
> 前端携带方式为 httpOnly cookie + Bearer 双通道。本节保留作 legacy 描述。

- Access Token：30min，Payload `{uid, email, plan}`。
- Refresh Token：7 天，存 Redis。
- 前端通过 httpOnly cookie 携带，backend 过滤器解析。

## 数据隔离（强制）

**所有数据查询必须带 user_id 过滤**，在 service 层强制：

```java
// PaperService
public Paper getPaper(Long paperId, Long userId) {
    return paperMapper.selectByIdAndUser(paperId, userId)
        .orElseThrow(() -> new AccessDeniedException("paper not found"));
}
```

**MyBatis-Plus 全局拦截器**：可选注入 tenant_id 防漏。

> 禁止出现「按 id 查询但不校验归属」的接口。

## 文件安全

> ⚠️ 过时注（2026-08-18）：当前实际为本地存储（research-file bundle，`STORAGE_TYPE=local`），
> S3/R2 分支未实现；路径穿越防护与旧后端代理兜底见上方「融合现状」。

- S3/R2 bucket 设为私有，不公开读。
- 访问 PDF 通过 backend 签发 **Signed URL**（有效期 15min）。
- 上传用 **Pre-signed POST**，前端直传 S3，backend 不中转文件流。

## 内部服务鉴权

- ai-service 只接受 backend 调用，用共享密钥 `X-Internal-Token` 校验。
- backend -> ai-service 的所有 HTTP 调用都带此 header。
- ai-service -> backend 的回调同样带此 header。
- `INTERNAL_TOKEN` 两端必须一致，从环境变量读取。

## 用户密码与密钥

- 用户密码用 BCrypt。
- JWT secret 从环境变量读取，不硬编码。
- LLM API key 只在 ai-service 的环境变量，不暴露给前端/backend。
