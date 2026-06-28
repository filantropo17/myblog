/**
 * Markdown 渲染展示组件 —— 接收预渲染好的 HTML 和标题列表，**只做展示**。
 * markdown → HTML 的工作在前端 Astro frontmatter（lib/markdown.ts）完成。
 *
 * 这样：
 * 1. SSR 阶段直接输出完整 HTML，"只有标题"问题根除
 * 2. 客户端 bundle 不再依赖 unified/remark-parse 等重库，首屏更快
 * 3. 客户端只需做 IntersectionObserver 跟踪当前阅读位置
 */
import { useEffect, useRef } from 'react';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface MarkdownProps {
  html: string;
  headings?: Heading[];
}

export function MarkdownRenderer({ html, headings = [] }: MarkdownProps) {
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).id;
            window.dispatchEvent(new CustomEvent('active-heading', { detail: id }));
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings]);

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_220px]">
      <article
        ref={articleRef}
        className="prose-editorial"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {headings.length > 1 && (
        <aside className="hidden lg:block">
          <div className="sticky top-32">
            <div className="eyebrow mb-4">目录</div>
            <nav className="space-y-1.5 border-l border-[var(--border)] pl-4 text-sm">
              {headings.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className={`block py-0.5 transition-colors ${
                    h.level === 3 ? 'pl-3 text-xs' : ''
                  } text-[var(--ink-mute)] hover:text-[var(--accent)]`}
                  data-heading-link={h.id}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}
