package com.researchos.controller;

import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.service.StorageService;
import com.researchos.service.impl.LocalStorageService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 文件上传与下载控制器。
 * - POST /api/local-upload/{token}: 本地存储上传（仅 local 模式）
 * - GET /api/files/{key}: 本地存储下载 / 代理 S3 下载
 *
 * @author myf
 * @since 2026-07-23
 */
@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class FileController {

    private final StorageService storageService;
    private final AppProperties appProperties;

    /**
     * 本地上传端点（仅当 storage.type = local 时有效）。
     */
    @PostMapping("/local-upload/{token}")
    public ResponseEntity<Map<String, String>> localUpload(
            @PathVariable String token,
            @RequestParam("file") MultipartFile file,
            @RequestParam("key") String key) {

        if (!"local".equals(appProperties.getStorage().getType())) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR);
        }

        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST.getCode(), "文件不能为空");
        }

        try (InputStream is = file.getInputStream()) {
            String storedKey = ((LocalStorageService) storageService).storeFile(token, is, key);
            return ResponseEntity.ok(Map.of("key", storedKey));
        } catch (IOException e) {
            log.error("本地上传失败", e);
            throw new BusinessException(ErrorCode.INTERNAL_ERROR);
        }
    }

    /**
     * 文件下载端点。
     * - local 模式：直接读取本地文件
     * - S3 模式：重定向到 S3 presigned URL
     *
     * key 形如 papers/{uuid}/{file}，可能包含多级路径。
     * Spring 6 的 {var:.*} 正则不跨路径段，因此用 /** 通配 + 从 URI 提取 key。
     * 类级 @RequestMapping("/api") 已含 /api 前缀，这里不要再加。
     */
    @GetMapping("/files/**")
    public void downloadFile(
            HttpServletRequest request,
            HttpServletResponse response) throws IOException {

        String key = extractKeyFromUri(request.getRequestURI());
        log.debug("下载文件: {}", key);

        if ("local".equals(appProperties.getStorage().getType())) {
            LocalStorageService localStorage = (LocalStorageService) storageService;

            if (!localStorage.fileExists(key)) {
                response.setStatus(HttpServletResponse.SC_NOT_FOUND);
                return;
            }

            String rangeHeader = request.getHeader(HttpHeaders.RANGE);
            if (rangeHeader != null) {
                servePartialContent(localStorage, key, rangeHeader, response);
            } else {
                serveFullContent(localStorage, key, response);
            }
        } else {
            // S3 模式：重定向到 presigned URL
            String signedUrl = storageService.getSignedDownloadUrl(key);
            response.sendRedirect(signedUrl);
        }
    }

    private void serveFullContent(LocalStorageService storage, String key, HttpServletResponse response) throws IOException {
        try (InputStream is = storage.readFile(key);
             OutputStream os = response.getOutputStream()) {

            response.setContentType(MediaType.APPLICATION_PDF_VALUE);
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + getFileName(key) + "\"");

            is.transferTo(os);
        }
    }

    private void servePartialContent(LocalStorageService storage, String key, String rangeHeader, HttpServletResponse response) throws IOException {
        try (InputStream is = storage.readFile(key)) {

            long fileSize = is.available();

            String range = rangeHeader.substring("bytes=".length());
            String[] parts = range.split("-");
            long start = parts[0].isEmpty() ? 0 : Long.parseLong(parts[0]);
            long end = parts.length > 1 && !parts[1].isEmpty() ? Long.parseLong(parts[1]) : fileSize - 1;

            if (start > end || end >= fileSize) {
                response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
                return;
            }

            response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
            response.setContentType(MediaType.APPLICATION_PDF_VALUE);
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + getFileName(key) + "\"");
            response.setHeader(HttpHeaders.CONTENT_RANGE, String.format("bytes %d-%d/%d", start, end, fileSize));
            response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");

            long contentLength = end - start + 1;
            response.setHeader(HttpHeaders.CONTENT_LENGTH, String.valueOf(contentLength));

            try (OutputStream os = response.getOutputStream()) {
                is.skip(start);
                byte[] buffer = new byte[8192];
                long remaining = contentLength;
                while (remaining > 0) {
                    int read = is.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                    if (read == -1) break;
                    os.write(buffer, 0, read);
                    remaining -= read;
                }
            }
        }
    }

    private String getFileName(String key) {
        int idx = key.lastIndexOf('/');
        String fileName = idx >= 0 ? key.substring(idx + 1) : key;
        return URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /**
     * 从请求 URI 提取存储 key（去掉 /api/files/ 前缀后 URL 解码）。
     */
    private String extractKeyFromUri(String requestUri) {
        String prefix = "/api/files/";
        int idx = requestUri.indexOf(prefix);
        String raw = idx >= 0 ? requestUri.substring(idx + prefix.length()) : requestUri;
        // 优先按原样使用（前端 encodeURI 已保留 /），再解码 %20 等转义
        return URLDecoder.decode(raw, StandardCharsets.UTF_8);
    }}
