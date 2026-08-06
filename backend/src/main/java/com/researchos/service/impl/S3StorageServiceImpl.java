package com.researchos.service.impl;

import com.researchos.common.exception.BusinessException;
import com.researchos.common.exception.ErrorCode;
import com.researchos.config.AppProperties;
import com.researchos.dto.PresignedPostResponse;
import com.researchos.service.StorageService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * S3 对象存储服务实现：签发 presigned URL。
 * 支持 S3 / Cloudflare R2（兼容 S3 API）。
 *
 * @author myf
 * @since 2026-07-08
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.storage.type", havingValue = "s3", matchIfMissing = true)
public class S3StorageServiceImpl implements StorageService {

    private final AppProperties props;
    private S3Presigner presigner;

    @PostConstruct
    public void init() {
        AppProperties.Storage s = props.getStorage();

        // 未配 S3 凭据时跳过初始化
        if (s.getAccessKey() == null || s.getAccessKey().isBlank()
                || s.getSecretKey() == null || s.getSecretKey().isBlank()) {
            log.warn("S3 凭据未配置，S3StorageService 跳过初始化");
            return;
        }

        var creds = AwsBasicCredentials.create(s.getAccessKey(), s.getSecretKey());
        S3Client client = S3Client.builder()
                .region(Region.of(s.getRegion()))
                .credentialsProvider(StaticCredentialsProvider.create(creds))
                .endpointOverride(s.getEndpoint() != null && !s.getEndpoint().isBlank()
                        ? java.net.URI.create(s.getEndpoint()) : null)
                .build();
        this.presigner = S3Presigner.builder()
                .region(Region.of(s.getRegion()))
                .credentialsProvider(StaticCredentialsProvider.create(creds))
                .endpointOverride(s.getEndpoint() != null && !s.getEndpoint().isBlank()
                        ? java.net.URI.create(s.getEndpoint()) : null)
                .build();
    }

    @Override
    public PresignedPostResponse presignUpload(String fileName, String contentType) {
        if (presigner == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR);
        }
        String key = "papers/" + UUID.randomUUID() + "/" + fileName;
        PutObjectRequest objectRequest = PutObjectRequest.builder()
                .bucket(props.getStorage().getBucket())
                .key(key)
                .contentType(contentType)
                .build();
        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(15))
                .putObjectRequest(objectRequest)
                .build();
        PresignedPutObjectRequest presigned = presigner.presignPutObject(presignRequest);
        return new PresignedPostResponse(
                presigned.url().toString(),
                Map.of("key", key, "Content-Type", contentType));
    }

    @Override
    public String getSignedDownloadUrl(String key) {
        if (presigner == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR);
        }
        var getRequest = software.amazon.awssdk.services.s3.model.GetObjectRequest.builder()
                .bucket(props.getStorage().getBucket())
                .key(key)
                .build();
        var presignRequest = software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(15))
                .getObjectRequest(getRequest)
                .build();
        return presigner.presignGetObject(presignRequest).url().toString();
    }
}
