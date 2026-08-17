package com.researchos.controller;

import com.researchos.config.AppProperties;
import com.researchos.security.CurrentUserResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * LaTeX 编译控制器：代理 ai-service /latex/compile，返回编译后的 PDF。
 *
 * @author myf
 * @since 2026-08-16
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class LatexCompileController {

    private final AppProperties appProperties;
    private final CurrentUserResolver currentUserResolver;
    private final RestTemplate restTemplate = new RestTemplate();

    /** 编译 LaTeX 源码，返回 PDF 文件流 */
    @PostMapping("/api/writing/compile")
    public ResponseEntity<byte[]> compile(@RequestBody Map<String, String> body) {
        currentUserResolver.requireUserId();
        String tex = body.getOrDefault("tex", "");

        String aiUrl = appProperties.getAiService().getBaseUrl() + "/latex/compile";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Token", appProperties.getAiService().getInternalToken());
        HttpEntity<Map<String, String>> entity = new HttpEntity<>(Map.of("tex", tex), headers);

        try {
            ResponseEntity<byte[]> response = restTemplate.exchange(
                    aiUrl, HttpMethod.POST, entity, byte[].class);
            if (response.getStatusCode() != HttpStatus.OK) {
                log.error("LaTeX 编译失败：status={}", response.getStatusCode());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body("LaTeX compilation failed".getBytes());
            }
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"compiled.pdf\"")
                    .body(response.getBody());
        } catch (Exception e) {
            log.error("LaTeX 编译调用失败", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(("LaTeX compilation error: " + e.getMessage()).getBytes());
        }
    }
}