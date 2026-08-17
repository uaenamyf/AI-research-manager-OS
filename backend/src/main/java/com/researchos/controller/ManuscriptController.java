package com.researchos.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.researchos.common.response.ApiResponse;
import com.researchos.entity.Manuscript;
import com.researchos.mapper.ManuscriptMapper;
import com.researchos.security.CurrentUserResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 手稿控制器（Writing 工作区保存/加载）。
 *
 * @author myf
 * @since 2026-08-16
 */
@RestController
@RequestMapping("/api/manuscripts")
@RequiredArgsConstructor
public class ManuscriptController {

    private final ManuscriptMapper manuscriptMapper;
    private final CurrentUserResolver currentUserResolver;

    /** 列出当前用户的手稿（可按项目过滤） */
    @GetMapping
    public ApiResponse<List<Manuscript>> list(@RequestParam(required = false) Long projectId) {
        Long userId = currentUserResolver.requireUserId();
        LambdaQueryWrapper<Manuscript> wrapper = new LambdaQueryWrapper<Manuscript>()
                .eq(Manuscript::getUserId, userId)
                .orderByDesc(Manuscript::getUpdatedTime);
        if (projectId != null) {
            wrapper.eq(Manuscript::getProjectId, projectId);
        }
        return ApiResponse.ok(manuscriptMapper.selectList(wrapper));
    }

    /** 获取单篇手稿 */
    @GetMapping("/{id}")
    public ApiResponse<Manuscript> get(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        Manuscript m = manuscriptMapper.selectById(id);
        if (m == null || !m.getUserId().equals(userId)) {
            return ApiResponse.fail(404, "Manuscript not found");
        }
        return ApiResponse.ok(m);
    }

    /** 创建手稿 */
    @PostMapping
    public ApiResponse<Manuscript> create(@RequestBody Manuscript req) {
        Long userId = currentUserResolver.requireUserId();
        Manuscript m = new Manuscript();
        m.setUserId(userId);
        m.setProjectId(req.getProjectId());
        m.setTitle(req.getTitle() == null || req.getTitle().isBlank() ? "Untitled" : req.getTitle().trim());
        m.setFormat(req.getFormat() == null ? "latex" : req.getFormat());
        m.setContent(req.getContent() == null ? "" : req.getContent());
        m.setCreatedTime(LocalDateTime.now());
        m.setUpdatedTime(LocalDateTime.now());
        manuscriptMapper.insert(m);
        return ApiResponse.ok(m);
    }

    /** 更新手稿 */
    @PutMapping("/{id}")
    public ApiResponse<Manuscript> update(@PathVariable Long id, @RequestBody Manuscript req) {
        Long userId = currentUserResolver.requireUserId();
        Manuscript m = manuscriptMapper.selectById(id);
        if (m == null || !m.getUserId().equals(userId)) {
            return ApiResponse.fail(404, "Manuscript not found");
        }
        if (req.getTitle() != null) m.setTitle(req.getTitle().trim());
        if (req.getFormat() != null) m.setFormat(req.getFormat());
        if (req.getContent() != null) m.setContent(req.getContent());
        if (req.getProjectId() != null) m.setProjectId(req.getProjectId());
        m.setUpdatedTime(LocalDateTime.now());
        manuscriptMapper.updateById(m);
        return ApiResponse.ok(m);
    }

    /** 删除手稿 */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        Long userId = currentUserResolver.requireUserId();
        Manuscript m = manuscriptMapper.selectById(id);
        if (m == null || !m.getUserId().equals(userId)) {
            return ApiResponse.fail(404, "Manuscript not found");
        }
        manuscriptMapper.deleteById(id);
        return ApiResponse.ok();
    }

    /** 更新手稿标题（快速重命名） */
    @PutMapping("/{id}/title")
    public ApiResponse<Void> rename(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Long userId = currentUserResolver.requireUserId();
        Manuscript m = manuscriptMapper.selectById(id);
        if (m == null || !m.getUserId().equals(userId)) {
            return ApiResponse.fail(404, "Manuscript not found");
        }
        m.setTitle(body.getOrDefault("title", "Untitled").trim());
        m.setUpdatedTime(LocalDateTime.now());
        manuscriptMapper.updateById(m);
        return ApiResponse.ok();
    }
}