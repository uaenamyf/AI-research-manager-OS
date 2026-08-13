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
    BAD_REQUEST(400, "Invalid request parameters"),
    UNAUTHORIZED(401, "Not logged in or session expired"),
    FORBIDDEN(403, "No permission to access this resource"),
    NOT_FOUND(404, "Resource not found"),
    INTERNAL_ERROR(500, "Internal server error"),

    // 认证 2xxx
    EMAIL_ALREADY_EXISTS(2001, "Email is already registered"),
    INVALID_CREDENTIALS(2002, "Incorrect email or password"),

    // 业务 3xxx
    PAPER_NOT_FOUND(3001, "Paper not found"),
    PAPER_NOT_READY(3002, "Paper has not been analyzed yet"),
    PROJECT_NOT_FOUND(3003, "Project not found"),
    TASK_NOT_FOUND(3004, "Task not found"),
    QUOTA_EXCEEDED(3005, "Free quota exceeded, please upgrade your subscription"),

    // AI 服务 4xxx
    AI_SERVICE_ERROR(4001, "AI service temporarily unavailable"),
    AI_SERVICE_TIMEOUT(4002, "AI service response timeout");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
