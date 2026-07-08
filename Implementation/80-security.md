# 80 - 认证与多租户隔离

## JWT

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
