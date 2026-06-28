/**
 * 服务端 Markdown 渲染 —— 在 Astro frontmatter 里把 markdown 字符串转成 HTML。
 * 客户端不需要这个包，不会进 bundle。
 *
 * 用法：
 * import { renderMarkdown } from '../lib/markdown';
 * const html = await renderMarkdown(post.content);
 * <article class="prose-editorial" set:html={html} />
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { codeToHtml } from './shiki-server.js';

// :::tip / :::warning / :::info / :::danger 自定义容器
function remarkContainers() {
  return (tree: any) => {
    visit(tree, (node, index, parent) => {
      if (node.type !== 'paragraph' || !parent || index === undefined) return;
      const text = node.children
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.value)
        .join('') ?? '';
      const match = text.match(/^:::(\w+)\s*([^\n]*)/);
      if (!match) return;
      const [, type, title] = match;
      const restText = text.replace(/^:::\w+\s*[^\n]*\n?/, '');
      parent.children[index] = {
        type: 'containerDirective',
        data: {
          hName: 'div',
          hProperties: { className: `container-${type}` },
        },
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'html',
                value: `<span class="container-title">${title || type.toUpperCase()}</span>`,
              },
            ],
          },
          {
            type: 'paragraph',
            children: [{ type: 'text', value: restText }],
          },
        ],
      };
    });
  };
}

/** 把 markdown 源码中的 ```lang ... ``` 代码块预渲染成 shiki HTML。 */
async function highlightCodeBlocks(md: string): Promise<string> {
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  const matches: Array<{ lang: string; code: string; full: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    matches.push({ lang: m[1] ?? 'text', code: m[2], full: m[0], index: m.index });
  }
  if (matches.length === 0) return md;

  let result = '';
  let cursor = 0;
  for (const match of matches) {
    result += md.slice(cursor, match.index);
    try {
      const highlighted = await codeToHtml(match.code.trim(), { lang: match.lang });
      const wrapped = `<div class="shiki-block my-6 rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-soft)]">${highlighted}</div>`;
      result += wrapped;
    } catch {
      const esc = match.code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      result += `<pre><code class="language-${match.lang}">${esc}</code></pre>`;
    }
    cursor = match.index + match.full.length;
  }
  result += md.slice(cursor);
  return result;
}

export interface RenderResult {
  html: string;
  headings: Array<{ id: string; text: string; level: number }>;
}

export async function renderMarkdown(md: string): Promise<RenderResult> {
  if (!md) return { html: '', headings: [] };
  const withHighlight = await highlightCodeBlocks(md);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkContainers)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(withHighlight);
  const html = String(file);
  // 提取 h2/h3 给目录用
  const headings: RenderResult['headings'] = [];
  visit(file, 'element', (node: any) => {
    if (node.tagName === 'h2' || node.tagName === 'h3') {
      const id = node.properties?.id ?? '';
      const text = (node.children ?? [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.value)
        .join('');
      headings.push({ id, text, level: node.tagName === 'h3' ? 3 : 2 });
    }
  });
  return { html, headings };
}
