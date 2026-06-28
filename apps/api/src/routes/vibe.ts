/**
 * Vibe 笔记路由。
 *
 * GET    /api/v1/vibe              列表（分页 + 筛选）
 * GET    /api/v1/vibe/:id          详情
 * POST   /api/v1/vibe              创建（author/admin）
 * PATCH  /api/v1/vibe/:id          更新（owner/admin）
 * DELETE /api/v1/vibe/:id          删除（owner/admin）
 * POST   /api/v1/vibe/:id/like     点赞
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, asc, and, sql, like } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/session.js';
import { rateLimit, startRateLimitCleanup } from '../middleware/rate-limit.js';
import { visitorHash as makeVisitorHash } from '../utils/crypto.js';

startRateLimitCleanup();

export const vibeRouter = new Hono();

const moodEnum = z.enum(['happy', 'think', 'angry', 'tired', 'inspired', 'chill']);

// ----------------------------------------------------------------------------
// 公共：列表
// ----------------------------------------------------------------------------

vibeRouter.get('/', async (c) => {
  const db = getDb();
  const limit = Math.min(Number(c.req.query('limit') ?? 30), 100);
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);
  const mood = c.req.query('mood');
  const status = c.req.query('status') ?? 'published';
  const author = c.req.query('author');

  const conds: any[] = [];
  // 公开访问只看到 published；登录用户看自己的全部
  const user = c.get('user');
  if (user && author === 'me') {
    conds.push(eq(schema.vibeNotes.authorId, user.id));
    if (status !== 'all') conds.push(eq(schema.vibeNotes.status, status as any));
  } else {
    conds.push(eq(schema.vibeNotes.status, 'published'));
    if (author) conds.push(eq(schema.vibeNotes.authorId, Number(author)));
  }
  if (mood) conds.push(eq(schema.vibeNotes.mood, mood as any));

  const rows = db
    .select()
    .from(schema.vibeNotes)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(schema.vibeNotes.pinned), desc(schema.vibeNotes.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json({ ok: true, data: rows });
});

// ----------------------------------------------------------------------------
// 公共：详情
// ----------------------------------------------------------------------------

vibeRouter.get('/:id', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const row = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
  if (!row) return c.json({ ok: false, error: 'Not found' }, 404);
  if (row.status === 'draft' || row.status === 'hidden') {
    const user = c.get('user');
    if (!user || (user.id !== row.authorId && user.role !== 'admin' && user.role !== 'editor')) {
      return c.json({ ok: false, error: 'Not found' }, 404);
    }
  }
  return c.json({ ok: true, data: row });
});

// ----------------------------------------------------------------------------
// 创建（author+）
// ----------------------------------------------------------------------------

const createSchema = z.object({
  title: z.string().max(120).optional(),
  content: z.string().min(1).max(500),
  mood: moodEnum.optional(),
  status: z.enum(['draft', 'published', 'hidden']).default('published'),
  pinned: z.boolean().default(false),
});

vibeRouter.post('/', requireRole('author'), zValidator('json', createSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const user = c.get('user')!;
  const now = new Date().toISOString();
  const inserted = db
    .insert(schema.vibeNotes)
    .values({
      // 没传 title 就用 content 前 30 字（与回填策略一致）
      title: body.title?.trim() || body.content.slice(0, 30) + (body.content.length > 30 ? '…' : ''),
      content: body.content,
      mood: body.mood ?? null,
      authorId: user.id,
      status: body.status,
      pinned: body.pinned ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return c.json({ ok: true, data: inserted }, 201);
});

// ----------------------------------------------------------------------------
// 更新（owner / admin / editor）
// ----------------------------------------------------------------------------

const updateSchema = z.object({
  title: z.string().max(120).optional(),
  content: z.string().min(1).max(500).optional(),
  mood: moodEnum.nullable().optional(),
  status: z.enum(['draft', 'published', 'hidden']).optional(),
  pinned: z.boolean().optional(),
});

vibeRouter.patch('/:id', requireAuth(), zValidator('json', updateSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');
  const user = c.get('user')!;
  const existing = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
  if (!existing) return c.json({ ok: false, error: 'Not found' }, 404);

  const isOwner = existing.authorId === user.id;
  const isEditor = user.role === 'admin' || user.role === 'editor';
  if (!isOwner && !isEditor) return c.json({ ok: false, error: 'Forbidden' }, 403);

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.mood !== undefined) updates.mood = body.mood;
  if (body.status !== undefined && isEditor) updates.status = body.status;
  if (body.pinned !== undefined && isEditor) updates.pinned = body.pinned ? 1 : 0;

  db.update(schema.vibeNotes).set(updates).where(eq(schema.vibeNotes.id, id)).run();
  const updated = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
  return c.json({ ok: true, data: updated });
});

// ----------------------------------------------------------------------------
// 删除（owner / admin / editor）
// ----------------------------------------------------------------------------

vibeRouter.delete('/:id', requireAuth(), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const user = c.get('user')!;
  const existing = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
  if (!existing) return c.json({ ok: false, error: 'Not found' }, 404);

  const isOwner = existing.authorId === user.id;
  const isEditor = user.role === 'admin' || user.role === 'editor';
  if (!isOwner && !isEditor) return c.json({ ok: false, error: 'Forbidden' }, 403);

  db.delete(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

// ----------------------------------------------------------------------------
// 点赞（公开，基于 visitor_hash 或 user_id 去重）
// ----------------------------------------------------------------------------

const ipFrom = (c: any) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
  c.req.header('x-real-ip') ||
  'unknown';

vibeRouter.post('/:id/like', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const note = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
  if (!note) return c.json({ ok: false, error: 'Not found' }, 404);

  const user = c.get('user');
  const visitor = user ? null : makeVisitorHash(ipFrom(c), 'vibe-like');

  // 去重
  let already: { id: number } | undefined;
  if (user) {
    already = db
      .select({ id: schema.reactions.id })
      .from(schema.reactions)
      .where(
        and(
          eq(schema.reactions.targetType, 'vibe'),
          eq(schema.reactions.targetId, id),
          eq(schema.reactions.userId, user.id),
          eq(schema.reactions.reaction, 'like')
        )
      )
      .get();
  } else if (visitor) {
    already = db
      .select({ id: schema.reactions.id })
      .from(schema.reactions)
      .where(
        and(
          eq(schema.reactions.targetType, 'vibe'),
          eq(schema.reactions.targetId, id),
          eq(schema.reactions.visitorHash, visitor),
          eq(schema.reactions.reaction, 'like')
        )
      )
      .get();
  }

  if (already) {
    // 取消点赞
    db.delete(schema.reactions).where(eq(schema.reactions.id, already.id)).run();
    db.update(schema.vibeNotes)
      .set({ likeCount: sql`max(0, ${schema.vibeNotes.likeCount} - 1)` })
      .where(eq(schema.vibeNotes.id, id))
      .run();
    const fresh = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
    return c.json({ ok: true, data: { liked: false, like_count: fresh?.likeCount ?? 0 } });
  }

  db.insert(schema.reactions)
    .values({
      targetType: 'vibe',
      targetId: id,
      userId: user?.id ?? null,
      visitorHash: visitor,
      reaction: 'like',
      createdAt: new Date().toISOString(),
    })
    .run();
  db.update(schema.vibeNotes)
    .set({ likeCount: sql`${schema.vibeNotes.likeCount} + 1` })
    .where(eq(schema.vibeNotes.id, id))
    .run();
  const fresh = db.select().from(schema.vibeNotes).where(eq(schema.vibeNotes.id, id)).get();
  return c.json({ ok: true, data: { liked: true, like_count: fresh?.likeCount ?? 0 } });
});