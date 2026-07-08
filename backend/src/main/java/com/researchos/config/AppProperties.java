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
    private Cors cors = new Cors();

    @Data
    public static class Jwt {
        private String secret;
        private Duration accessTtl = Duration.ofMinutes(30);
        private Duration refreshTtl = Duration.ofDays(7);
    }

    @Data
    public static class Storage {
        private String type = "s3";
        private String bucket;
        private String region = "us-east-1";
        private String accessKey;
        private String secretKey;
        private String endpoint;
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
    public static class Cors {
        private List<String> allowedOrigins;
    }
}
