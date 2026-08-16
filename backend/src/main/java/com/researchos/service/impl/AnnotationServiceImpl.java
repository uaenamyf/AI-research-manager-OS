package com.researchos.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.researchos.entity.Annotation;
import com.researchos.mapper.AnnotationMapper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 批注服务实现。
 *
 * @author myf
 * @since 2026-08-15
 */
@Service
public class AnnotationServiceImpl extends ServiceImpl<AnnotationMapper, Annotation> {

    public List<Annotation> listByPaper(Long paperId, Long userId) {
        return list(new LambdaQueryWrapper<Annotation>()
                .eq(Annotation::getPaperId, paperId)
                .eq(Annotation::getUserId, userId)
                .orderByAsc(Annotation::getPageNum)
                .orderByAsc(Annotation::getId));
    }
}