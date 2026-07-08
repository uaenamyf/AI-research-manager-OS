package com.researchos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.researchos.entity.User;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户 Mapper。
 *
 * @author myf
 * @since 2026-07-08
 */
@Mapper
public interface UserMapper extends BaseMapper<User> {
}
