/**
 * 管理后台 API 聚合。
 *
 * 所有端点需要 editor+ 权限。
 *
 * GET    /api/v1/admin/vibe                所有 vibe 笔记
 * POST   /api/v1/admin/vibe                新建
 * PATCH  /api/v1/admin/vibe/:id            更新
 * DELETE /api/v1/admin/vibe/:id            删除
 * GET    /api/v1/admin/comments            按 status 过滤
 * PATCH  /api/v1/admin/comments/:id/moderate
 * DELETE /api/v1/admin/comments/:id
 * GET    /api/v1/admin/users
 * POST   /api/v1/admin/users
 * PATCH  /api/v1/admin/users/:id
 * DELETE /api/v1/admin/users/:id
 * GET    /api/v1/admin/subscribers
 * DELETE /api/v1/admin/subscribers/:id
 * GET    /api/v1/admin/analytics           仪表盘聚合数据
 * POST   /api/v1/admin/search/rebuild      重建 FTS 索引
 * GET    /api/v1/admin/search/status       索引大小
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { desc, eq, sql, gte, and } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/session.js';
import { hashPassword } from '../utils/crypto.js';

export const adminRouter = new Hono();

// 全部需要至少 editor
adminRouter.use('*', requireRole('editor'));

// ============================================================================
// Vibe 笔记
// ============================================================================

adminRouter.get('/vibe', async (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.vibeNotes)
    .orderBy(desc(schema.vibeNotes.createdAt))
    .all();
  return c.json({ ok: true, data: rows });
});

const vibeCreateSchema = z.object({
  title: z.string().max(120).optional(),
  content: z.string().min(1).max(500),
  mood: z.enum(['happy', 'think', 'angry', 'tired', 'inspired', 'chill']).optional(),
  status: z.enum(['draft', 'published', 'hidden']).default('published'),
  pinned: z.boolean().default(false),
});

adminRouter.post('/vibe', zValidator('json', vibeCreateSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const user = c.get('user')!;
  const now = new Date().toISOString();
  const inserted = db
    .insert(schema.vibeNotes)
    .values({
      title: body.title?.trim() || body.content.slice(0, 30) + (body.content.length > 30 ? '…' : ''),
      content: body.content,
      mood: body.mood ?? null,
      status: body.status,
      pinned: body.pinned ? 1 : 0,
      authorId: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return c.json({ ok: true, data: inserted }, 201);
});

const vibeUpdateSchema = z.object({
  title: z.string().max(120).optional(),
  content: z.string().min(1).max(500).optional(),
  mood: z.enum(['happy', 'think', 'angry', 'tired', 'inspired', 'chill']).nullable().optional(),
  status: z.enum(['draft', 'published', 'hidden']).optional(),
  pinned: z.boolean().optional(),
});

adminRouter.patch('/vibe/:id', zValidator('json', vibeUpdateSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.mood !== undefined) updates.mood = body.mood;
  if (body.status !== undefined) updates.status = body.status;
  if (body.pinned !== undefined) updates.pinned = body.pinned ? 1 : 0;
  db.update(schema.vibeNotes).set(updates).where(eq(schema.vibeNotes.id, id)).run();
  const updated = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
  return c.json({ ok: true, data: updated });
});

adminRouter.delete('/vibe/:id', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  db.delete(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

// ============================================================================
// 评论审核
// ============================================================================

adminRouter.get('/comments', async (c) => {
  const db = getDb();
  const status = c.req.query('status') ?? 'pending';
  const rows = db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.status, status as any))
    .orderBy(desc(schema.comments.createdAt))
    .limit(200)
    .all();
  return c.json({ ok: true, data: rows });
});

const moderateSchema = z.object({
  action: z.enum(['approve', 'reject', 'spam']),
});

adminRouter.patch('/comments/:id/moderate', zValidator('json', moderateSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');
  const newStatus =
    body.action === 'approve' ? 'approved' : body.action === 'spam' ? 'spam' : 'rejected';
  const existing = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
  if (!existing) return c.json({ ok: false, error: 'Not found' }, 404);

  const wasApproved = existing.status === 'approved';
  db.update(schema.comments)
    .set({ status: newStatus })
    .where(eq(schema.comments.id, id))
    .run();
  const willBeApproved = newStatus === 'approved';

  if (!wasApproved && willBeApproved) {
    if (existing.targetType === 'post') {
      db.update(schema.posts)
        .set({ commentCount: sql`${schema.posts.commentCount} + 1` })
        .where(eq(schema.posts.id, existing.targetId))
        .run();
    } else {
      db.update(schema.vibeNotes)
        .set({ commentCount: sql`${schema.vibeNotes.commentCount} + 1` })
        .where(eq(schema.vibeNotes.id, existing.targetId))
        .run();
    }
  }
  return c.json({ ok: true, data: { id, status: newStatus } });
});

adminRouter.delete('/comments/:id', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const existing = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
  if (existing?.status === 'approved') {
    if (existing.targetType === 'post') {
      db.update(schema.posts)
        .set({ commentCount: sql`max(0, ${schema.posts.commentCount} - 1)` })
        .where(eq(schema.posts.id, existing.targetId))
        .run();
    }
  }
  db.delete(schema.comments).where(eq(schema.comments.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

// ============================================================================
// 用户管理（仅 admin）
// ============================================================================

adminRouter.get('/users', requireRole('admin'), async (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all();
  return c.json({ ok: true, data: rows });
});

const userCreateSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(40),
  password: z.string().min(8),
  display_name: z.string().optional(),
  role: z.enum(['admin', 'editor', 'author', 'reader']).default('reader'),
});

adminRouter.post('/users', requireRole('admin'), zValidator('json', userCreateSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const existing = db.select().from(schema.users).where(eq(schema.users.email, body.email)).get();
  if (existing) return c.json({ ok: false, error: 'Email exists' }, 409);
  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();
  const inserted = db
    .insert(schema.users)
    .values({
      email: body.email,
      username: body.username,
      passwordHash,
      displayName: body.display_name ?? body.username,
      role: body.role,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return c.json({ ok: true, data: inserted }, 201);
});

const userUpdateSchema = z.object({
  role: z.enum(['admin', 'editor', 'author', 'reader']).optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  display_name: z.string().optional(),
});

adminRouter.patch('/users/:id', requireRole('admin'), zValidator('json', userUpdateSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');
  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.role !== undefined) updates.role = body.role;
  if (body.status !== undefined) updates.status = body.status;
  if (body.display_name !== undefined) updates.displayName = body.display_name;
  db.update(schema.users).set(updates).where(eq(schema.users.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

adminRouter.delete('/users/:id', requireRole('admin'), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  db.update(schema.users).set({ status: 'deleted' }).where(eq(schema.users.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

// ============================================================================
// 订阅者
// ============================================================================

adminRouter.get('/subscribers', async (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt))
    .all();
  return c.json({ ok: true, data: rows });
});

adminRouter.delete('/subscribers/:id', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  db.delete(schema.subscribers).where(eq(schema.subscribers.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

// ============================================================================
// 数据分析// ============================================================================

adminRouter.get('/analytics', async (c) => {
  const db = getDb();
  const sqlite = db.$client;

  // 时间范围（默认 30d）：影响 trend / commentsTrend 数组长度
  const rangeParam = c.req.query('range') ?? '30d';
  const rangeDays = rangeParam === '7d' ? 7 : rangeParam === '90d' ? 90 : 30;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - rangeDays).toISOString();

  // ---- 顶数（6 项）----
  const todayPV = (sqlite.prepare(`SELECT count(*) as c FROM page_views WHERE created_at >= ?`).get(todayStart) as any).c;
  const yesterdayPV = (sqlite.prepare(`SELECT count(*) as c FROM page_views WHERE created_at >= ? AND created_at < ?`).get(yesterdayStart, todayStart) as any).c;
  const weekPV = (sqlite.prepare(`SELECT count(*) as c FROM page_views WHERE created_at >= ?`).get(weekStart) as any).c;
  const totalPosts = (sqlite.prepare(`SELECT count(*) as c FROM posts WHERE status='published'`).get() as any).c;
  const pendingComments = (sqlite.prepare(`SELECT count(*) as c FROM comments WHERE status='pending'`).get() as any).c;
  const subscribersCount = (sqlite.prepare(`SELECT count(*) as c FROM subscribers WHERE status='active'`).get() as any).c;
  const usersCount = (sqlite.prepare(`SELECT count(*) as c FROM users WHERE status='active'`).get() as any).c;
  // 过去 7 天内有过消息的 chat session 视为活跃
  const activeChats = (sqlite.prepare(
    `SELECT count(DISTINCT session_id) as c FROM chat_messages WHERE created_at >= ?`
  ).get(new Date(now.getTime() - 7 * 86400_000).toISOString()) as any).c;
  // 近 24h 审计日志条数（ 提示）
  const recentAuditCount = (sqlite.prepare(
    `SELECT count(*) as c FROM ai_audit_logs WHERE created_at >= ?`
  ).get(new Date(now.getTime() - 86400_000).toISOString()) as any).c;

  // ---- PV 趋势（受 range 控制）----
  const trendRows = sqlite.prepare(`
    SELECT date(created_at) as date, count(*) as views
    FROM page_views
    WHERE created_at >= date('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY date
  `).all(rangeDays) as Array<{ date: string; views: number }>;

  const trend: Array<{ date: string; views: number }> = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10);
    const found = trendRows.find((r) => r.date === d);
    trend.push({ date: d, views: found?.views ?? 0 });
  }

  // ---- Top 10 文章（按总 PV 排序）----
  const topPosts = sqlite.prepare(`
    SELECT id, slug, title, view_count as views FROM posts
    WHERE status='published'
    ORDER BY view_count DESC LIMIT 10
  `).all();

  // ---- 来源分布（归一化 host，按 range 时间窗口内聚合）----
  const sourceRows = sqlite.prepare(`
    SELECT COALESCE(NULLIF(referer, ''), utm_source, 'direct') as source, count(*) as count
    FROM page_views WHERE created_at >= ?
    GROUP BY source ORDER BY count DESC LIMIT 10
  `).all(monthStart) as Array<{ source: string; count: number }>;

  // ---- Vibe 统计 ----
  const monthVibeStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthCount = (sqlite.prepare(`SELECT count(*) as c FROM vibe_notes WHERE created_at >= ?`).get(monthVibeStart) as any).c;
  const totalLikes = (sqlite.prepare(`SELECT COALESCE(sum(like_count), 0) as s FROM vibe_notes`).get() as any).s;

  // ---- 评论趋势（受 range 控制）----
  const commentsTrendRaw = sqlite
    .prepare(
      `SELECT date(created_at) as date, count(*) as count
       FROM comments WHERE created_at >= date('now', '-' || ? || ' days')
       GROUP BY date(created_at) ORDER BY date`
    )
    .all(rangeDays) as Array<{ date: string; count: number }>;
  const commentsTrend: Array<{ date: string; count: number }> = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10);
    const found = commentsTrendRaw.find((r) => r.date === d);
    commentsTrend.push({ date: d, count: found?.count ?? 0 });
  }

  // 来源 host 归一化
const normalizedSources = sourceRows.map((s) => ({
    ...s,
    label: normalizeReferrer(s.source),
  }));

  return c.json({
    ok: true,
    data: {
      stats: {
        todayPV,
        yesterdayPV,
        weekPV,
        totalPosts,
        pendingComments,
        subscribersCount,
        usersCount,
        activeChats,
        recentAuditCount,
      },
      range: rangeDays,
      trend,
      sources: normalizedSources,
      topPosts,
      vibeStats: { monthCount, totalLikes },
      commentsTrend,
    },
  });
});

/** 把 referrer URL 收敛成可读的来源名。 */
function normalizeReferrer(raw: string): string {
  if (!raw || raw === 'direct') return '直接访问';
  try {
    if (raw.startsWith('http')) {
      const host = new URL(raw).hostname.replace(/^www\./, '');
      return host;
    }
    return raw;
  } catch {
    return raw;
  }
}

// ============================================================================
// 搜索索引管理（admin only）
// ============================================================================

adminRouter.post('/search/rebuild', requireRole('admin'), async (c) => {
  const db = getDb();
  const sqlite = db.$client;
  sqlite.exec(`DELETE FROM posts_fts; DELETE FROM vibe_fts;`);
  sqlite.exec(`INSERT INTO posts_fts(rowid, title, content, tags) SELECT id, title, content, tags FROM posts;`);
  sqlite.exec(`INSERT INTO vibe_fts(rowid, content, mood) SELECT id, content, COALESCE(mood,'') FROM vibe_notes;`);
  return c.json({ ok: true, data: { rebuilt: true } });
});

adminRouter.get('/search/status', requireRole('admin'), async (c) => {
  const db = getDb();
  const sqlite = db.$client;
  const ftsPosts = (sqlite.prepare(`SELECT count(*) as c FROM posts_fts`).get() as any).c;
  const ftsVibe = (sqlite.prepare(`SELECT count(*) as c FROM vibe_fts`).get() as any).c;
  const postsTotal = (sqlite.prepare(`SELECT count(*) as c FROM posts`).get() as any).c;
  const vibeTotal = (sqlite.prepare(`SELECT count(*) as c FROM vibe_notes`).get() as any).c;
  return c.json({
    ok: true,
    data: {
      ftsPosts,
      ftsVibe,
      postsTotal,
      vibeTotal,
      inSync: ftsPosts === postsTotal && ftsVibe === vibeTotal,
    },
  });
});