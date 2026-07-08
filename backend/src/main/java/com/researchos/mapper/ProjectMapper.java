package com.researchos.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.researchos.entity.ResearchProject;
import org.apache.ibatis.annotations.Mapper;

/**
 * 项目 Mapper。
 *
 * @author myf
 * @since 2026-07-08
 */
@Mapper
public interface ProjectMapper extends BaseMapper<ResearchProject> {
}
