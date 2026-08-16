package com.researchos.controller;

import com.researchos.common.response.ApiResponse;
import com.researchos.config.AppProperties;
import com.researchos.entity.Paper;
import com.researchos.security.CurrentUserResolver;
import com.researchos.service.PaperService;
import com.researchos.service.ProjectService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * 段落级文献推荐控制器（Phase 2.4）。
 *
 * @author myf
 * @since 2026-08-15
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class RecommendController {

    private final PaperService paperService;
    private final ProjectService projectService;
    private final CurrentUserResolver currentUserResolver;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    /** 段落级文献推荐：选中文本 → 检索相关论文 */
    @PostMapping("/api/papers/recommendations")
    public ApiResponse<Map<String, Object>> recommend(
            @RequestBody Map<String, Object> body) {
        Long userId = currentUserResolver.requireUserId();
        Long projectId = Long.valueOf(body.get("projectId").toString());
        String text = (String) body.get("text");

        // 1. 校验项目归属
        projectService.requireProjectOwnedBy(projectId, userId);

        // 2. 获取项目下所有 READY 论文的 ID
        List<Paper> papers = paperService.lambdaQuery()
                .eq(Paper::getProjectId, projectId)
                .eq(Paper::getUserId, userId)
                .eq(Paper::getStatus, "READY")
                .select(Paper::getId, Paper::getTitle, Paper::getAuthors, Paper::getYear)
                .list();
        List<Long> paperIds = papers.stream().map(Paper::getId).toList();
        if (paperIds.isEmpty()) {
            return ApiResponse.ok(Map.of("results", List.of()));
        }

        // 3. 调用 ai-service /rag/recommend
        try {
            String aiUrl = appProperties.getAiService().getBaseUrl() + "/rag/recommend";
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("text", text);
            payload.put("paper_ids", paperIds);
            payload.put("top_k", 10);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Token", appProperties.getAiService().getInternalToken());
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);

            ResponseEntity<Map> response = restTemplate.exchange(aiUrl, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode() != HttpStatus.OK) {
                log.error("ai-service 推荐失败：status={}", response.getStatusCode());
                return ApiResponse.ok(Map.of("results", List.of()));
            }

            // 4. 解析结果并丰富论文元数据
            Map<String, Object> aiResponse = response.getBody();
            List<Map<String, Object>> rawResults = (List<Map<String, Object>>) aiResponse.get("results");

            // 建立 paperId → Paper 的映射
            Map<Long, Paper> paperMap = new HashMap<>();
            papers.forEach(p -> paperMap.put(p.getId(), p));

            List<Map<String, Object>> enriched = new ArrayList<>();
            for (Map<String, Object> r : rawResults) {
                Object pidObj = r.get("paper_id");
                if (pidObj == null) continue;
                Long pid = ((Number) pidObj).longValue();
                Paper p = paperMap.get(pid);
                if (p != null) {
                    r.put("paper_title", p.getTitle());
                    r.put("paper_authors", p.getAuthors());
                    r.put("paper_year", p.getYear());
                }
                enriched.add(r);
            }

            return ApiResponse.ok(Map.of("results", enriched));
        } catch (Exception e) {
            log.error("文献推荐失败", e);
            return ApiResponse.ok(Map.of("results", List.of()));
        }
    }
}