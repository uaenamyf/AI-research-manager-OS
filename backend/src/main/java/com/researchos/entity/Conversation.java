package com.researchos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 聊天历史实体。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@TableName("conversation")
public class Conversation {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long paperId;
    private String question;
    private String answer;
    private OffsetDateTime createdTime;
}
