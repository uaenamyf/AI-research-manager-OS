package com.researchos.service;

import com.researchos.entity.Paper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 引用格式渲染服务：支持 APA、MLA、GB/T 7714 格式。
 *
 * <p>Paper 实体字段：title（标题）、authors（逗号分隔）、year（年份）、doi。
 * 无 venue/journal 字段，引用中不包含期刊名。</p>
 *
 * @author myf
 * @since 2026-08-15
 */
@Service
@RequiredArgsConstructor
public class CitationService {

    public enum Format { APA, MLA, GB_7714 }

    /**
     * 单篇论文渲染为指定格式的引用文本。
     */
    public String render(Paper paper, Format format) {
        return switch (format) {
            case APA -> renderApa(paper);
            case MLA -> renderMla(paper);
            case GB_7714 -> renderGbt7714(paper);
        };
    }

    /**
     * 批量渲染。
     */
    public List<String> renderBatch(List<Paper> papers, Format format) {
        return papers.stream().map(p -> render(p, format)).toList();
    }

    /** 从逗号分隔的作者字符串解析为姓名列表。 */
    List<String> parseAuthors(String authorsStr) {
        if (authorsStr == null || authorsStr.isBlank()) return List.of();
        return List.of(authorsStr.split("\\s*,\\s*"));
    }

    // ── APA 7th ──
    // 格式：Author, A. A., & Author, B. B. (Year). Title. https://doi.org/xxxx
    String renderApa(Paper paper) {
        List<String> authors = parseAuthors(paper.getAuthors());
        String authorPart = formatAuthorsApa(authors);
        String year = paper.getYear() != null ? paper.getYear().toString() : "n.d.";
        String title = (paper.getTitle() != null ? paper.getTitle().trim() : "Untitled");
        String doi = paper.getDoi() != null && !paper.getDoi().isBlank()
                ? " https://doi.org/" + paper.getDoi().trim() : "";
        return authorPart + " (" + year + "). " + title + "." + doi;
    }

    String formatAuthorsApa(List<String> authors) {
        if (authors.isEmpty()) return "Anonymous";
        if (authors.size() == 1) return invertName(authors.get(0));
        if (authors.size() == 2) return invertName(authors.get(0)) + ", & " + invertName(authors.get(1));
        // 3+ authors: First, ..., & Last
        List<String> inverted = authors.stream().map(this::invertName).toList();
        return String.join(", ", inverted.subList(0, inverted.size() - 1))
                + ", & " + inverted.get(inverted.size() - 1);
    }

    // ── MLA 9th ──
    // 格式：Last, First. Title. Year.
    String renderMla(Paper paper) {
        List<String> authors = parseAuthors(paper.getAuthors());
        String authorPart = formatAuthorsMla(authors);
        String title = (paper.getTitle() != null ? paper.getTitle().trim() : "Untitled");
        String year = paper.getYear() != null ? paper.getYear().toString() : "n.d.";
        String doi = paper.getDoi() != null && !paper.getDoi().isBlank()
                ? " doi:" + paper.getDoi().trim() : "";
        return authorPart + " \"" + title + ".\" " + year + "." + doi;
    }

    String formatAuthorsMla(List<String> authors) {
        if (authors.isEmpty()) return "Anonymous.";
        if (authors.size() == 1) return invertName(authors.get(0)) + ".";
        // MLA: Last, First, and First Last.
        List<String> inverted = authors.stream().map(this::invertName).toList();
        String first = inverted.get(0);
        String rest = authors.subList(1, authors.size()).stream()
                .collect(Collectors.joining(", "));
        return first + ", and " + rest + ".";
    }

    // ── GB/T 7714 ──
    // 格式：作者. 题名[D]. 年份.
    String renderGbt7714(Paper paper) {
        List<String> authors = parseAuthors(paper.getAuthors());
        String authorPart = formatAuthorsGbt7714(authors);
        String title = (paper.getTitle() != null ? paper.getTitle().trim() : "未命名");
        String year = paper.getYear() != null ? paper.getYear().toString() : "n.d.";
        return authorPart + " " + title + "[D]. " + year + ".";
    }

    String formatAuthorsGbt7714(List<String> authors) {
        if (authors.isEmpty()) return "佚名";
        // 保留原始顺序，逗号分隔
        return String.join(", ", authors) + ".";
    }

    /** "First Last" → "Last, F."（APA 反转名） */
    String invertName(String fullName) {
        String trimmed = fullName.trim();
        int spaceIdx = trimmed.lastIndexOf(' ');
        if (spaceIdx <= 0) return trimmed;
        String lastName = trimmed.substring(spaceIdx + 1);
        String firstNames = trimmed.substring(0, spaceIdx);
        // 缩写名：取首字母
        String initials = firstNames.chars()
                .filter(Character::isUpperCase)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        if (initials.isEmpty()) {
            // 如果没有大写字母，取第一个词的首字母
            initials = String.valueOf(firstNames.charAt(0));
        }
        return lastName + ", " + String.join("", initials.chars().mapToObj(c -> (char) c + ".").toList()).trim();
    }
}