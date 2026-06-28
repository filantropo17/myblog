/**
 * 分析 / AI 上下文端点。
 */
import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { rowToPost } from '../utils/sensitive.js';

export const analyticsRouter = new Hono();

analyticsRouter.get('/ai-context', async (c) => {
  const db = getDb();

  const topPosts = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(10)
    .all()
    .map(rowToPost);

  // 构建标签分布
  const allPosts = db
    .select({ tags: schema.posts.tags })
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .all();

  const tagCount: Record<string, number> = {};
  for (const r of allPosts) {
    try {
      const tags = JSON.parse(r.tags) as string[];
      for (const t of tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
    } catch {
      // 忽略
    }
  }

  // 统计
  const totalPosts = db
    .select({ c: schema.posts.id })
    .from(schema.posts)
    .all().length;
  const totalProjects = db
    .select({ c: schema.projects.id })
    .from(schema.projects)
    .all().length;
  const drafts = db
    .select({ c: schema.posts.id })
    .from(schema.posts)
    .where(eq(schema.posts.status, 'draft'))
    .all();

  return c.json({
    ok: true,
    data: {
      topPosts,
      tagDistribution: tagCount,
      recentSearches: ['View Transitions', 'Drizzle ORM', 'Astro 5', 'Hono'],
      totalPosts,
      totalProjects,
      draftCount: drafts.length,
    },
  });
});

analyticsRouter.get('/audit', async (c) => {
  const db = getDb();
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const rows = db
    .select()
    .from(schema.aiAuditLogs)
    .orderBy(desc(schema.aiAuditLogs.createdAt))
    .limit(limit)
    .all();
  return c.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      method: r.method,
      payloadSummary: r.payloadSummary,
      responseStatus: r.responseStatus,
      latencyMs: r.latencyMs,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
    })),
  });
});

analyticsRouter.get('/stats', async (c) => {
  const db = getDb();
  const postsCount = db.select().from(schema.posts).all().length;
  const publishedCount = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .all().length;
  const draftCount = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.status, 'draft'))
    .all().length;
  const projectsCount = db.select().from(schema.projects).all().length;
  const auditCount = db.select().from(schema.aiAuditLogs).all().length;

  return c.json({
    ok: true,
    data: {
      posts: postsCount,
      published: publishedCount,
      drafts: draftCount,
      projects: projectsCount,
      auditLogs: auditCount,
    },
  });
});
