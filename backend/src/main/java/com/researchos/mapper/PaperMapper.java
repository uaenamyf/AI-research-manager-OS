package com.researchos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.researchos.entity.Paper;
import org.apache.ibatis.annotations.Mapper;

/**
 * 论文 Mapper。
 *
 * @author myf
 * @since 2026-07-08
 */
@Mapper
public interface PaperMapper extends BaseMapper<Paper> {
}
