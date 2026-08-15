package com.researchos.dto;

import lombok.Data;

import java.util.List;

/**
 * 论文导入请求（文献检索一键入库 / DOI 导入）。
 *
 * @author myf
 * @since 2026-08-15
 */
@Data
public class PaperImportRequest {

    /** DOI（存在时经 Crossref 补全权威元数据） */
    private String doi;

    /** 标题（无 DOI 或 Crossref 失败时的兜底） */
    private String title;

    /** 作者（可选，逗号或数组；无 DOI 时用） */
    private List<String> authors;

    /** 发表年份 */
    private Integer year;

    /** 开放获取 PDF 直链（可选；有则触发 AI 分析，无则仅元数据入库） */
    private String pdfUrl;

    /** 目标文件夹（可选） */
    private Long folderId;
}
