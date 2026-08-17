/**
 * 轻量 Markdown → HTML 渲染器（无依赖，用于写作预览）。
 *
 * 支持：标题、粗体、斜体、行内代码、代码块、列表、链接、引用、分隔线、段落。
 */
"use client";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(md: string): string {
  let html = escapeHtml(md);
  // 行内代码
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // 粗体
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 斜体
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // 链接
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return html;
}

/** 将 Markdown 文本渲染为 HTML 字符串。 */
export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      html.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }

    // 分隔线
    if (/^---+$/.test(line.trim())) {
      html.push("<hr />");
      i++;
      continue;
    }

    // 标题
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // 引用
    if (line.trim().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(inline(lines[i].trim().replace(/^>\s?/, "")));
        i++;
      }
      html.push(`<blockquote>${buf.join("<br />")}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 段落（连续非空行）
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith(">")
    ) {
      buf.push(inline(lines[i]));
      i++;
    }
    html.push(`<p>${buf.join(" ")}</p>`);
  }

  return html.join("\n");
}