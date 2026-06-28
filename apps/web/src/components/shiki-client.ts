/**
 * 客户端 shiki 高亮器 —— 懒加载以避免膨胀初始 bundle。
 */
import { createHighlighter, type Highlighter } from 'shiki';

let _highlighter: Promise<Highlighter> | null = null;

const LANGS = [
  'ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'bash', 'shell',
  'python', 'rust', 'go', 'sql', 'yaml', 'md', 'markdown', 'vue', 'svelte',
  'java', 'kotlin', 'swift', 'c', 'cpp', 'ruby', 'php', 'dockerfile',
];

const THEMES = ['github-dark-default', 'github-light-default'];

function getHighlighter() {
  if (!_highlighter) {
    _highlighter = createHighlighter({
      themes: THEMES,
      langs: LANGS,
    });
  }
  return _highlighter;
}

export async function codeToHtml(code: string, opts: { lang?: string } = {}): Promise<string> {
  const lang = (opts.lang ?? 'text').toLowerCase();
  const hl = await getHighlighter();
  const supportedLangs = hl.getLoadedLanguages();
  const safeLang = supportedLangs.includes(lang as any) ? lang : 'text';

  const html = hl.codeToHtml(code, {
    lang: safeLang,
    themes: {
      light: 'github-light-default',
      dark: 'github-dark-default',
    },
    defaultColor: false,
  });

  // 追加主题相关的颜色 CSS 变量
  return html.replace(
    /<pre[^>]*style="([^"]*)"/,
    `<pre style="$1" class="shiki-pre"`
  );
}
