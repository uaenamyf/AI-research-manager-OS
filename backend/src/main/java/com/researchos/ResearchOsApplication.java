package com.researchos;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * ResearchOS AI 后端应用入口。
 *
 * @author myf
 * @since 2026-07-08
 */
@SpringBootApplication
@MapperScan("com.researchos.mapper")
public class ResearchOsApplication {
    public static void main(String[] args) {
        SpringApplication.run(ResearchOsApplication.class, args);
    }
}
