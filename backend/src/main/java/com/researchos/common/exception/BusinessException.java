package com.researchos.common.exception;

import lombok.Getter;

/**
 * 业务异常，携带错误码与消息。
 *
 * @author myf
 * @since 2026-07-08
 */
@Getter
public class BusinessException extends RuntimeException {

    private final int code;

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.code = errorCode.getCode();
    }
}
