package com.researchos.service.impl;

import com.researchos.config.AppProperties;
import com.researchos.dto.PresignedPostResponse;
import com.researchos.service.StorageService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 本地文件存储服务：开发环境替代 S3。
 * 文件存到 ./uploads/ 目录，通过 /api/files/{key} 访问。
 *
 * @author myf
 * @since 2026-07-23
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.storage.type", havingValue = "local")
public class LocalStorageService implements StorageService {

    private final AppProperties props;
    private final Map<String, String> tokenToKey = new ConcurrentHashMap<>();
    private Path uploadDir;

    @PostConstruct
    public void init() throws IOException {
        String localDir = props.getStorage().getLocalDir();
        if (localDir == null || localDir.isBlank()) {
            localDir = "./uploads";
        }
        this.uploadDir = Paths.get(localDir).toAbsolutePath().normalize();
        Files.createDirectories(uploadDir);
        log.info("LocalStorageService 初始化完成，上传目录: {}", uploadDir);
    }

    @Override
    public PresignedPostResponse presignUpload(String fileName, String contentType) {
        String token = UUID.randomUUID().toString();
        String key = "papers/" + UUID.randomUUID() + "/" + fileName;
        tokenToKey.put(token, key);

        // 生成上传 URL（本地端点）
        String uploadUrl = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/local-upload/" + token)
                .toUriString();

        return new PresignedPostResponse(uploadUrl, Map.of("key", key));
    }

    @Override
    public String getSignedDownloadUrl(String key) {
        // 本地 URL 直接返回文件端点（无签名验证，开发期简化）
        String encodedKey = URLEncoder.encode(key, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%2F", "/");

        return ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/files/" + encodedKey)
                .toUriString();
    }

    /**
     * 存储文件到本地。
     */
    public String storeFile(String token, InputStream inputStream, String expectedKey) throws IOException {
        String key = tokenToKey.remove(token);
        if (key == null) {
            throw new IllegalArgumentException("无效的上传 Token");
        }
        if (!key.equals(expectedKey)) {
            throw new IllegalArgumentException("Key 不匹配");
        }

        Path filePath = uploadDir.resolve(key).normalize();
        if (!filePath.startsWith(uploadDir)) {
            throw new SecurityException("非法路径: " + key);
        }

        Files.createDirectories(filePath.getParent());
        Files.copy(inputStream, filePath, StandardCopyOption.REPLACE_EXISTING);
        log.info("文件已存储: {}", filePath);
        return key;
    }

    /**
     * 读取文件流。
     */
    public InputStream readFile(String key) throws IOException {
        Path filePath = uploadDir.resolve(key).normalize();
        if (!filePath.startsWith(uploadDir)) {
            throw new SecurityException("非法路径: " + key);
        }
        return Files.newInputStream(filePath);
    }

    /**
     * 检查文件是否存在。
     */
    public boolean fileExists(String key) {
        Path filePath = uploadDir.resolve(key).normalize();
        return filePath.startsWith(uploadDir) && Files.exists(filePath);
    }
}
