/**
 * 估算阅读时长（分钟）。
 * 平均阅读速度：英文约 250 词/分钟，中日韩（CJK）约 400 字/分钟。
 */
export function estimateReadingTime(content: string): number {
  const cjkCount = (content.match(/[一-龥぀-ヿ가-힯]/g) ?? []).length;
  const wordCount = (content.match(/[a-zA-Z]+/g) ?? []).length;
  const minutes = cjkCount / 400 + wordCount / 250;
  return Math.max(1, Math.ceil(minutes));
}

/**
 * 从 markdown 内容中生成摘要。
 * 会移除 frontmatter、标题标记、代码块和链接。
 */
export function generateExcerpt(content: string, maxLength = 180): string {
  const cleaned = content
    .replace(/^---[\s\S]*?---/, '') // frontmatter
    .replace(/```[\s\S]*?```/g, '') // 代码块
    .replace(/^#+\s*/gm, '') // 标题
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接
    .replace(/[*_`>~|]/g, '') // 强调符号
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // 图片
    .replace(/\n+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd() + '…';
}
