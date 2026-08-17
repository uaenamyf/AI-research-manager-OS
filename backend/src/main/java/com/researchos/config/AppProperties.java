package com.researchos.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

/**
 * 应用配置属性绑定。
 *
 * @author myf
 * @since 2026-07-08
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Storage storage = new Storage();
    private AiService aiService = new AiService();
    private OAuth oauth = new OAuth();
    private Stripe stripe = new Stripe();
    private Subscription subscription = new Subscription();
    private Cors cors = new Cors();

    @Data
    public static class Jwt {
        private String secret;
        private Duration accessTtl = Duration.ofMinutes(30);
    }

    @Data
    public static class Storage {
        private String type = "s3";
        private String bucket;
        private String region = "us-east-1";
        private String accessKey;
        private String secretKey;
        private String endpoint;
        private String localDir = "./uploads";
    }

    @Data
    public static class AiService {
        private String baseUrl;
        private String internalToken;
    }

    @Data
    public static class OAuth {
        private Google google = new Google();
    }

    @Data
    public static class Google {
        private String clientId;
        private String clientSecret;
    }

    @Data
    public static class Stripe {
        private String secretKey;
        private String webhookSecret;
        private String pricePro;
        private String priceResearcher;

        /** 是否已配置 Stripe（无 key 时订阅功能优雅降级）。 */
        public boolean isConfigured() {
            return secretKey != null && !secretKey.isBlank();
        }
    }

    @Data
    public static class Subscription {
        /** 是否启用上传/解析额度校验（开发阶段默认关闭，生产用 ENFORCE_QUOTA=true 打开）。 */
        private boolean enforceQuota = false;
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins;
    }
}
