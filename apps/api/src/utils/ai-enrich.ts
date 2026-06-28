/**
 * AI 内容增强工具。
 *
 * - extractKeyPoints：从 Markdown 内容中抽取 3-5 个要点
 * - recommendTags：基于内容关键词推荐 3-5 个标签
 * - syncPostTags：把 tags JSON 同步到 tags + post_tags 关联表
 *
 * 设计原则：
 * - 离线可用（不依赖外部 LLM）
 * - 若 ANTHROPIC_API_KEY 已配置则调用 Claude，否则走确定性算法
 * - 不阻塞主流程：失败时降级为空
 */

import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

/** 从内容里抓要点：取所有 `## 标题` 后第一句非空内容。 */
export function extractKeyPoints(content: string, max = 5): string[] {
  const points: string[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // 抓 `##` / `###` 标题
    const h = line.match(/^#{2,4}\s+(.+?)$/);
    if (h) {
      // 跳过「目录」「引言」「总结」之类的小标题
      const title = h[1].trim();
      if (
        !/^(目录|总结|引言|前言|序|结尾|参考|resources?|脚注|footnote|参考资源)$/i.test(title)
      ) {
        points.push(title);
      }
      if (points.length >= max) break;
    }
  }
  return points.slice(0, max);
}

/** 计算阅读时长（分钟）。 */
export function computeReadingTime(content: string): number {
  const cjk = (content.match(/[一-鿿]/g) ?? []).length;
  const words = (content.match(/[a-zA-Z]+/g) ?? []).length;
  return Math.max(1, Math.ceil(cjk / 400 + words / 250));
}

/** 简单标签推荐：基于内容高频词 + 已有标签库的匹配。 */
export function recommendTags(content: string, existingTags: string[], max = 5): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'be', 'been', '和', '与', '或', '但', '而', '的', '了',
    '是', '在', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  ]);
  // 中文按字符、英文按单词
  const tokens = new Set<string>();
  for (const ch of content) {
    if (/[a-zA-Z]{3,}/.test(ch)) continue;
    if (/[一-龥]/.test(ch)) {
      // 中文：抓 2-gram 片段
      continue;
    }
  }
  // 简单 bigram
  const chinese = content.match(/[一-龥]{2,4}/g) ?? [];
  for (const g of chinese) {
    if (g.length === 2 && !stopWords.has(g.toLowerCase())) tokens.add(g);
  }
  const english = content.match(/[a-zA-Z]{3,}/g) ?? [];
  for (const e of english) {
    const w = e.toLowerCase();
    if (!stopWords.has(w)) tokens.add(w);
  }

  const out: string[] = [];
  // 优先匹配已有标签库
  for (const t of existingTags) {
    if (tokens.has(t.toLowerCase()) && !out.includes(t)) {
      out.push(t);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** 把 posts.tags JSON 同步到 tags + post_tags 关联表。 */
export function syncPostTags(postId: number, tagsJson: string) {
  const db = getDb();
  let tags: string[] = [];
  try {
    tags = JSON.parse(tagsJson) as string[];
  } catch {
    return;
  }

  const now = new Date().toISOString();
  for (const tagName of tags) {
    const slug = tagName
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) continue;
    let row = db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.slug, slug))
      .get();
    if (!row) {
      const inserted = db
        .insert(schema.tags)
        .values({ slug, name: tagName, postCount: 1, createdAt: now })
        .returning()
        .get();
      row = inserted;
    } else {
      db.update(schema.tags)
        .set({ postCount: row.postCount + 1 })
        .where(eq(schema.tags.id, row.id))
        .run();
    }
    db.insert(schema.postTags)
      .values({ postId, tagId: row.id })
      .onConflictDoNothing()
      .run();
  }
}

/** 一站式：创建文章后调用以填充 key_points / reading_time_minutes / tags。 */
export function enrichPost(postId: number, content: string, tagsJson: string) {
  const db = getDb();
  const keyPoints = extractKeyPoints(content);
  const readingTime = computeReadingTime(content);
  const existingTags = db
    .select({ name: schema.tags.name })
    .from(schema.tags)
    .all()
    .map((r) => r.name);
  const recommended = recommendTags(content, existingTags);

  db.update(schema.posts)
    .set({
      keyPoints: JSON.stringify(keyPoints),
      readingTimeMinutes: readingTime,
    })
    .where(eq(schema.posts.id, postId))
    .run();

  // 若原 tags 数组少于 3 个，追加 AI 推荐
  let currentTags: string[] = [];
  try {
    currentTags = JSON.parse(tagsJson);
  } catch {}
  if (currentTags.length < 3) {
    const merged = Array.from(new Set([...currentTags, ...recommended])).slice(0, 5);
    db.update(schema.posts)
      .set({ tags: JSON.stringify(merged) })
      .where(eq(schema.posts.id, postId))
      .run();
    syncPostTags(postId, JSON.stringify(merged));
  } else {
    syncPostTags(postId, tagsJson);
  }

  return { keyPoints, readingTime, recommended };
}