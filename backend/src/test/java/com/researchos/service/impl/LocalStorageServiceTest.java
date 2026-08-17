package com.researchos.service.impl;

import com.researchos.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 本地存储服务测试：文件写入/读取/删除（论文删除时的文件清理）。
 *
 * @author myf
 * @since 2026-08-17
 */
class LocalStorageServiceTest {

    @TempDir
    Path tempDir;

    private LocalStorageService service;

    @BeforeEach
    void setUp() throws Exception {
        AppProperties props = new AppProperties();
        AppProperties.Storage storage = new AppProperties.Storage();
        storage.setType("local");
        storage.setLocalDir(tempDir.toString());
        props.setStorage(storage);

        service = new LocalStorageService(props);
        service.init();
    }

    // 2026-08-17 myf: 论文删除时清理本地 PDF + 空的论文目录，避免孤儿文件
    @Test
    void deleteFile_deletesFileAndEmptyParentDir() throws Exception {
        // 直接写入 uploads/papers/abc/test.pdf（presignUpload 依赖 Servlet 上下文，单测不走）
        Path dir = tempDir.resolve("papers/abc");
        Files.createDirectories(dir);
        Path file = dir.resolve("test.pdf");
        Files.write(file, "pdf-bytes".getBytes(StandardCharsets.UTF_8));
        assertTrue(service.fileExists("papers/abc/test.pdf"));

        service.deleteFile("papers/abc/test.pdf");

        assertFalse(service.fileExists("papers/abc/test.pdf"));
        // 空的论文目录 papers/abc 也被顺带清理
        assertFalse(Files.exists(dir));
    }

    @Test
    void deleteFile_nonexistent_doesNotThrow() {
        assertDoesNotThrow(() -> service.deleteFile("papers/ghost/missing.pdf"));
    }

    @Test
    void deleteFile_blankKey_doesNotThrow() {
        assertDoesNotThrow(() -> service.deleteFile("  "));
    }

    @Test
    void deleteFile_pathTraversal_throwsSecurityException() throws Exception {
        // 上传目录外逃逸的 key 必须拒绝
        Path outside = tempDir.getParent().resolve("outside.pdf");
        Files.write(outside, "evil".getBytes(StandardCharsets.UTF_8));
        assertThrows(SecurityException.class,
                () -> service.deleteFile("../outside.pdf"));
        Files.deleteIfExists(outside);
    }
}
