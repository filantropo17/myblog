/**
 * 将数据库行转换为 API 响应结构（驼峰命名、JSON 解析）。
 */
import type { PostRow, ProjectRow, AuditRow } from '../db/schema.js';
import type { Post, Project, AiAuditLog } from '@myblog/shared';
import { estimateReadingTime } from './reading.js';

export function rowToPost(row: PostRow): Post {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    excerpt: row.excerpt,
    category: row.category as Post['category'],
    tags: safeJsonArray(row.tags),
    status: row.status as Post['status'],
    sourceType: row.sourceType as Post['sourceType'],
    sourceMeta: row.sourceMeta ? safeJsonObject(row.sourceMeta) : null,
    seoDescription: row.seoDescription,
    coverImageUrl: row.coverImageUrl,
    aiReviewFeedback: row.aiReviewFeedback,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    readingTime: estimateReadingTime(row.content),
  };
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    techStack: safeJsonArray(row.techStack),
    githubUrl: row.githubUrl,
    demoUrl: row.demoUrl,
    fullProjectUrl: row.fullProjectUrl,
    changelog: row.changelog,
    screenshots: safeJsonArray(row.screenshots),
    status: row.status as Project['status'],
    sortOrder: row.sortOrder,
    githubMeta: row.githubMeta ? safeJsonObject(row.githubMeta) : null,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToAudit(row: AuditRow): AiAuditLog {
  return {
    id: row.id,
    endpoint: row.endpoint,
    method: row.method,
    payloadSummary: row.payloadSummary,
    responseStatus: row.responseStatus,
    latencyMs: row.latencyMs,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  };
}

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeJsonObject(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
