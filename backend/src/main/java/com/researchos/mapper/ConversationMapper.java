package com.researchos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.researchos.entity.Conversation;
import org.apache.ibatis.annotations.Mapper;

/**
 * 聊天历史 Mapper。
 *
 * @author myf
 * @since 2026-07-08
 */
@Mapper
public interface ConversationMapper extends BaseMapper<Conversation> {
}
