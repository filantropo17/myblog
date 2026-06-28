/**
 * 客户端流式 Markdown 渲染（ChatPanel 用）。
 *
 * 与 SSR 的 `markdown.ts` 不同：
 * - 这里只需要处理对话助手消息（短文本、含 [1] 引用、列表、加粗）
 * - 不需要代码高亮、自定义容器、TOC
 * - 用 marked（轻、~30KB gzip）+ DOMPurify（防 XSS）足够
 * - 每收到一段 SSE delta 就重 parse 整个 buffer；marked 解析短文本 < 1ms
 *
 * marked 配置：breaks=true 把 \n 转 <br>，避免模型写纯文本段落时挤压成一团
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true,
});

/** 流式安全的 markdown → HTML 渲染。 */
export function renderChatMarkdown(text: string): string {
  if (!text) return '';
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel'],
  });
}