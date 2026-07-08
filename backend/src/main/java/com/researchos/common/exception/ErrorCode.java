package com.researchos.common.exception;

import lombok.Getter;

/**
 * 业务错误码枚举。
 *
 * @author myf
 * @since 2026-07-08
 */
@Getter
public enum ErrorCode {

    // 通用 1xxx
    BAD_REQUEST(400, "请求参数错误"),
    UNAUTHORIZED(401, "未登录或登录已过期"),
    FORBIDDEN(403, "无权访问该资源"),
    NOT_FOUND(404, "资源不存在"),
    INTERNAL_ERROR(500, "系统内部错误"),

    // 认证 2xxx
    EMAIL_ALREADY_EXISTS(2001, "邮箱已被注册"),
    INVALID_CREDENTIALS(2002, "邮箱或密码错误"),

    // 业务 3xxx
    PAPER_NOT_FOUND(3001, "论文不存在"),
    PAPER_NOT_READY(3002, "论文尚未分析完成"),
    PROJECT_NOT_FOUND(3003, "项目不存在"),
    TASK_NOT_FOUND(3004, "任务不存在"),
    QUOTA_EXCEEDED(3005, "免费额度已用完，请升级订阅"),

    // AI 服务 4xxx
    AI_SERVICE_ERROR(4001, "AI 服务暂时不可用"),
    AI_SERVICE_TIMEOUT(4002, "AI 服务响应超时");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
