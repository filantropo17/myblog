/**
 * 草稿归一化 + 敏感词检测。
 *
 * + 阶段一已实现：从手动输入创建草稿 → normalizeManual；
 * 敏感词检测用于评论/草稿创建时拦截密钥泄露。
 *
 *  阶段二起不再提供 AI 自动生成（GitHub/大纲/热点 → 草稿），
 * 仅保留 manual 路径 + 敏感词检测。本文件只负责这两个职责。
 */

import type { CreatePostInput } from '@myblog/shared';

export interface AiDraftResult {
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  category: 'tech' | 'project' | 'diary';
  source_meta: Record<string, unknown>;
  seo_description: string;
}

// ----------------------------------------------------------------------------
// 手动输入（直传）
// ----------------------------------------------------------------------------

export function normalizeManual(input: CreatePostInput): AiDraftResult {
  return {
    title: input.title,
    content: input.content,
    excerpt: input.content.slice(0, 180),
    tags: input.tags ?? [],
    category: input.category ?? 'tech',
    source_meta: input.source_meta ?? {},
    seo_description: input.seo_description ?? input.content.slice(0, 160),
  };
}

// ----------------------------------------------------------------------------
// 敏感词检测
// ----------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
  /secret\s*[:=]\s*\S+/i,
  /bearer\s+[a-zA-Z0-9._-]{20,}/i,
];

export function detectSensitive(text: string): string[] {
  const hits: string[] = [];
  for (const p of SENSITIVE_PATTERNS) {
    if (p.test(text)) hits.push(p.source);
  }
  return hits;
}