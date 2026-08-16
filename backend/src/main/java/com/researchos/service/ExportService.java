package com.researchos.service;

import com.researchos.entity.Paper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 文献导出服务：BibTeX、RIS 格式生成。
 *
 * @author myf
 * @since 2026-08-15
 */
@Service
@RequiredArgsConstructor
public class ExportService {

    private final CitationService citationService;

    /** 生成 BibTeX 条目 */
    public String toBibtex(Paper paper) {
        String key = generateCitationKey(paper);
        String authors = formatBibtexAuthors(paper.getAuthors());
        String title = (paper.getTitle() != null ? paper.getTitle().trim() : "Untitled");
        String year = paper.getYear() != null ? paper.getYear().toString() : "n.d.";
        String doi = paper.getDoi() != null && !paper.getDoi().isBlank() ? paper.getDoi().trim() : "";

        StringBuilder sb = new StringBuilder();
        sb.append("@article{").append(key).append(",\n");
        sb.append("  author = {").append(authors).append("},\n");
        sb.append("  title = {").append(title).append("},\n");
        sb.append("  year = {").append(year).append("},\n");
        if (!doi.isBlank()) {
            sb.append("  doi = {").append(doi).append("},\n");
        }
        sb.append("}\n");
        return sb.toString();
    }

    /** 批量生成 BibTeX */
    public String toBibtexBatch(List<Paper> papers) {
        return papers.stream().map(this::toBibtex).collect(Collectors.joining("\n"));
    }

    /** 生成 RIS 条目 */
    public String toRis(Paper paper) {
        StringBuilder sb = new StringBuilder();
        sb.append("TY  - JOUR\n");
        if (paper.getAuthors() != null && !paper.getAuthors().isBlank()) {
            for (String author : citationService.parseAuthors(paper.getAuthors())) {
                sb.append("AU  - ").append(author).append("\n");
            }
        }
        String title = (paper.getTitle() != null ? paper.getTitle().trim() : "Untitled");
        sb.append("TI  - ").append(title).append("\n");
        if (paper.getYear() != null) {
            sb.append("PY  - ").append(paper.getYear()).append("\n");
        }
        if (paper.getDoi() != null && !paper.getDoi().isBlank()) {
            sb.append("DO  - ").append(paper.getDoi().trim()).append("\n");
        }
        sb.append("ER  - \n");
        return sb.toString();
    }

    /** 批量生成 RIS */
    public String toRisBatch(List<Paper> papers) {
        return papers.stream().map(this::toRis).collect(Collectors.joining("\n"));
    }

    /** 生成 BibTeX citation key（首作者姓氏+年份，如 "Bermant2019"） */
    private String generateCitationKey(Paper paper) {
        String authorPart = "unknown";
        String yearPart = paper.getYear() != null ? paper.getYear().toString() : "nd";

        if (paper.getAuthors() != null && !paper.getAuthors().isBlank()) {
            List<String> authors = citationService.parseAuthors(paper.getAuthors());
            if (!authors.isEmpty()) {
                String first = authors.get(0).trim();
                // 取最后一个词作为姓氏
                int spaceIdx = first.lastIndexOf(' ');
                if (spaceIdx > 0) {
                    authorPart = first.substring(spaceIdx + 1);
                } else {
                    authorPart = first;
                }
            }
        }

        // 移除特殊字符
        String key = (authorPart + yearPart).replaceAll("[^a-zA-Z0-9]", "");
        return key.isEmpty() ? "paper" : key;
    }

    /** BibTeX 作者格式：Last, First and Last, First */
    private String formatBibtexAuthors(String authorsStr) {
        if (authorsStr == null || authorsStr.isBlank()) return "Anonymous";
        List<String> authors = citationService.parseAuthors(authorsStr);
        return authors.stream()
                .map(this::invertBibtexAuthor)
                .collect(Collectors.joining(" and "));
    }

    private String invertBibtexAuthor(String name) {
        String trimmed = name.trim();
        int spaceIdx = trimmed.lastIndexOf(' ');
        if (spaceIdx <= 0) return trimmed;
        String lastName = trimmed.substring(spaceIdx + 1);
        String firstNames = trimmed.substring(0, spaceIdx);
        return lastName + ", " + firstNames;
    }
}