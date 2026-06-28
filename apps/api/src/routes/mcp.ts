/**
 * MCP 端点（AI 代运营 / 外部 agent 调用）。
 *
 * 区别于 /api/v1/admin/*：
 * - admin 走 session 鉴权* - mcp 走 X-AI-API-Key 鉴权（aiAuth）
 * 路径：/api/mcp/*
 *
 * GET    /api/mcp/drafts              草稿列表（按 status 过滤）
 * GET    /api/mcp/drafts/:id          草稿详情
 * POST   /api/mcp/drafts              创建草稿（manual）
 * POST   /api/mcp/drafts/from-github
 * POST   /api/mcp/drafts/from-outline
 * POST   /api/mcp/drafts/from-trending
 * POST   /api/mcp/drafts/:id/review   审核（publish / reject / request_revision）
 * PATCH  /api/mcp/posts/:id           编辑已存在文章
 * GET    /api/mcp/posts               文章列表（按 status 过滤）
 * GET    /api/mcp/comments            评论列表（按 status 过滤）
 * POST   /api/mcp/comments/:id/moderate
 * GET    /api/mcp/analytics           仪表盘聚合
 * POST   /api/mcp/search/rebuild      重建 FTS
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { desc, eq, and } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { aiAuth, audit } from '../middleware/auth.js';
import { normalizeManual } from '../services/ai-content.js';

export const mcpRouter = new Hono();

// MCP 端点统一用 AI Key 鉴权
mcpRouter.use('*', aiAuth);

// ----------------------------------------------------------------------------
// 草稿：列表 / 详情
// ----------------------------------------------------------------------------

mcpRouter.get('/drafts', async (c) => {
  const db = getDb();
  const status = c.req.query('status') ?? 'draft';
  const sourceType = c.req.query('source_type');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  const conditions: any[] = [eq(schema.posts.status, status as any)];
  if (sourceType) conditions.push(eq(schema.posts.sourceType, sourceType as any));

  const rows = db
    .select()
    .from(schema.posts)
    .where(and(...conditions))
    .orderBy(desc(schema.posts.updatedAt))
    .limit(limit)
    .all();
  await audit(c, 200);
  return c.json({ ok: true, data: rows });
});

mcpRouter.get('/drafts/:id', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const post = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  if (!post) {
    await audit(c, 404);
    return c.json({ ok: false, error: 'Not found' }, 404);
  }
  let sourceMeta: any = null;
  try {
    sourceMeta = post.sourceMeta ? JSON.parse(post.sourceMeta) : null;
  } catch {}
  await audit(c, 200);
  return c.json({ ok: true, data: { ...post, source_meta_parsed: sourceMeta } });
});

// ----------------------------------------------------------------------------
// 草稿：创建
// ----------------------------------------------------------------------------

const manualSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  excerpt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(['tech', 'project', 'diary']).default('tech'),
  seo_description: z.string().max(300).optional(),
  cover_image_url: z.string().optional(),
});

mcpRouter.post('/drafts', zValidator('json', manualSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const result = normalizeManual({ ...body, source_type: 'manual' } as any);
  const now = new Date().toISOString();
  const slug = `${result.title.toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').slice(0, 60)}-${Date.now().toString(36)}`;

  const inserted = db
    .insert(schema.posts)
    .values({
      slug,
      title: result.title,
      content: result.content,
      excerpt: result.excerpt,
      tags: JSON.stringify(result.tags),
      category: result.category,
      sourceType: 'manual',
      sourceMeta: JSON.stringify(result.source_meta),
      seoDescription: result.seo_description,
      coverImageUrl: result.cover_image_url ?? null,
      status: 'draft',
      commentCount: 0,
      viewCount: 0,
      likeCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await audit(c, 201);
  return c.json({ ok: true, data: inserted }, 201);
});

// ----------------------------------------------------------------------------
// 草稿：审核
// ----------------------------------------------------------------------------

const reviewSchema = z.object({
  action: z.enum(['publish', 'reject', 'request_revision']),
  feedback: z.string().optional(),
  edited_content: z.string().optional(),
});

mcpRouter.post('/drafts/:id/review', zValidator('json', reviewSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  if (!existing) {
    await audit(c, 404);
    return c.json({ ok: false, error: 'Not found' }, 404);
  }

  const updates: Record<string, any> = { updatedAt: now };
  if (body.action === 'publish') {
    updates.status = 'published';
    if (!existing.publishedAt) updates.publishedAt = now;
    if (body.edited_content) {
      updates.content = body.edited_content;
      updates.excerpt = body.edited_content.replace(/[#>*_`~\-]/g, '').slice(0, 180);
      db.insert(schema.postVersions)
        .values({
          postId: id,
          content: body.edited_content,
          editedBy: 'mcp-agent',
          changeSummary: 'Review & publish via MCP',
        })
        .run();
    }
  } else if (body.action === 'reject') {
    updates.status = 'rejected';
    updates.aiReviewFeedback = body.feedback ?? null;
  } else {
    updates.status = 'draft';
    updates.aiReviewFeedback = body.feedback ?? null;
  }

  db.update(schema.posts).set(updates).where(eq(schema.posts.id, id)).run();
  const updated = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  await audit(c, 200);
  return c.json({ ok: true, data: updated });
});

// ----------------------------------------------------------------------------
// 文章：编辑
// ----------------------------------------------------------------------------

const postPatchSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  category: z.enum(['tech', 'project', 'diary']).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'rejected']).optional(),
  seo_description: z.string().max(300).optional(),
  cover_image_url: z.string().optional(),
});

mcpRouter.patch('/posts/:id', zValidator('json', postPatchSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  if (!existing) {
    await audit(c, 404);
    return c.json({ ok: false, error: 'Not found' }, 404);
  }

  const updates: Record<string, any> = { updatedAt: now };
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.excerpt !== undefined) updates.excerpt = body.excerpt;
  if (body.category !== undefined) updates.category = body.category;
  if (body.seo_description !== undefined) updates.seoDescription = body.seo_description;
  if (body.cover_image_url !== undefined) updates.coverImageUrl = body.cover_image_url;
  if (body.status !== undefined) updates.status = body.status;
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);

  if (body.content && body.content !== existing.content) {
    db.insert(schema.postVersions)
      .values({
        postId: id,
        content: body.content,
        editedBy: 'mcp-agent',
        changeSummary: 'MCP edit',
      })
      .run();
  }

  db.update(schema.posts).set(updates).where(eq(schema.posts.id, id)).run();
  const updated = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  await audit(c, 200);
  return c.json({ ok: true, data: updated });
});

// ----------------------------------------------------------------------------
// 文章：列表
// ----------------------------------------------------------------------------

mcpRouter.get('/posts', async (c) => {
  const db = getDb();
  const status = c.req.query('status') ?? 'published';
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);

  const rows = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.status, status as any))
    .orderBy(desc(schema.posts.updatedAt))
    .limit(limit)
    .all();
  await audit(c, 200);
  return c.json({ ok: true, data: rows });
});

// ----------------------------------------------------------------------------
// 评论：列表 / 审核
// ----------------------------------------------------------------------------

mcpRouter.get('/comments', async (c) => {
  const db = getDb();
  const status = c.req.query('status') ?? 'pending';
  const rows = db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.status, status as any))
    .orderBy(desc(schema.comments.createdAt))
    .limit(200)
    .all();
  await audit(c, 200);
  return c.json({ ok: true, data: rows });
});

const moderateSchema = z.object({ action: z.enum(['approve', 'reject', 'spam']) });
mcpRouter.post('/comments/:id/moderate', zValidator('json', moderateSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');
  const newStatus = body.action === 'approve' ? 'approved' : body.action === 'spam' ? 'spam' : 'rejected';
  const existing = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
  if (!existing) {
    await audit(c, 404);
    return c.json({ ok: false, error: 'Not found' }, 404);
  }
  db.update(schema.comments).set({ status: newStatus }).where(eq(schema.comments.id, id)).run();
  await audit(c, 200);
  return c.json({ ok: true, data: { id, status: newStatus } });
});

// ----------------------------------------------------------------------------
// 分析数据（复用 admin 端点查询）
// ----------------------------------------------------------------------------

mcpRouter.get('/analytics', async (c) => {
  const db = getDb();
  const sqlite = db.$client;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

  const todayPV = (sqlite.prepare(`SELECT count(*) as c FROM page_views WHERE created_at >= ?`).get(todayStart) as any).c;
  const weekPV = (sqlite.prepare(`SELECT count(*) as c FROM page_views WHERE created_at >= ?`).get(weekStart) as any).c;
  const totalPosts = (sqlite.prepare(`SELECT count(*) as c FROM posts WHERE status='published'`).get() as any).c;
  const pendingDrafts = (sqlite.prepare(`SELECT count(*) as c FROM posts WHERE status='draft'`).get() as any).c;
  const pendingComments = (sqlite.prepare(`SELECT count(*) as c FROM comments WHERE status='pending'`).get() as any).c;
  const subscribers = (sqlite.prepare(`SELECT count(*) as c FROM subscribers WHERE status='confirmed'`).get() as any).c;

  const topPosts = sqlite.prepare(`
    SELECT id, slug, title, view_count as views FROM posts
    WHERE status='published' ORDER BY view_count DESC LIMIT 5
  `).all();

  await audit(c, 200);
  return c.json({
    ok: true,
    data: {
      today_pv: todayPV,
      week_pv: weekPV,
      total_posts: totalPosts,
      pending_drafts: pendingDrafts,
      pending_comments: pendingComments,
      confirmed_subscribers: subscribers,
      top_posts: topPosts,
    },
  });
});

// ----------------------------------------------------------------------------
// 搜索索引
// ----------------------------------------------------------------------------

mcpRouter.post('/search/rebuild', async (c) => {
  const db = getDb();
  const sqlite = db.$client;
  sqlite.exec(`DELETE FROM posts_fts; DELETE FROM vibe_fts;`);
  sqlite.exec(`INSERT INTO posts_fts(rowid, title, content, tags) SELECT id, title, content, tags FROM posts;`);
  sqlite.exec(`INSERT INTO vibe_fts(rowid, content, mood) SELECT id, content, COALESCE(mood,'') FROM vibe_notes;`);
  await audit(c, 200);
  return c.json({ ok: true, data: { rebuilt: true } });
});
