/**
 * 评论路由。
 *
 * POST /api/v1/comments                           提交评论（游客/登录）
 * GET  /api/v1/comments/:targetType/:targetId     获取目标的评论列表
 * PATCH /api/v1/comments/:id/moderate            审核（editor+）
 * DELETE /api/v1/comments/:id                     删除（owner/admin/editor）
 *
 * 业务规则：
 * - 嵌套最多 2 层
 * - 首次评论 → pending；已批准过的游客（同 ip_hash + email）→ approved
 * - 登录用户 → approved
 * - 同一 IP 5 分钟最多 3 条
 * - 命中敏感词 → pending + warning
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/session.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { visitorHash as makeVisitorHash } from '../utils/crypto.js';
import { detectSensitive } from '../utils/sensitive-words.js';

export const commentsRouter = new Hono();

// ----------------------------------------------------------------------------
// 提交评论
// ----------------------------------------------------------------------------

const submitSchema = z.object({
  target_type: z.enum(['post', 'vibe']),
  target_id: z.number().int().positive(),
  parent_id: z.number().int().positive().optional(),
  author_name: z.string().min(1).max(40),
  author_email: z.string().email().max(200).optional(),
  content: z.string().min(1).max(2000),
});

function ipFrom(c: any) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

commentsRouter.post('/', zValidator('json', submitSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const user = c.get('user');
  const ip = ipFrom(c);

  // 速率限制：5 分钟 3 条
  if (!rateLimit(`comment:${ip}`, 3, 5 * 60_000)) {
    return c.json({ ok: false, error: 'Too many comments. Slow down.' }, 429);
  }

  // 目标存在性
  if (body.target_type === 'post') {
    const p = db
      .select({ id: schema.posts.id, status: schema.posts.status })
      .from(schema.posts)
      .where(eq(schema.posts.id, body.target_id))
      .get();
    if (!p || p.status !== 'published') {
      return c.json({ ok: false, error: 'Target not found' }, 404);
    }
  } else {
    const v = db
      .select({ id: schema.vibeNotes.id, status: schema.vibeNotes.status })
      .from(schema.vibeNotes)
      .where(eq(schema.vibeNotes.id, body.target_id))
      .get();
    if (!v || v.status !== 'published') {
      return c.json({ ok: false, error: 'Target not found' }, 404);
    }
  }

  // 嵌套最多 2 层
  if (body.parent_id) {
    const parent = db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, body.parent_id))
      .get();
    if (!parent) return c.json({ ok: false, error: 'Parent not found' }, 400);
    if (parent.parent_id) {
      // 已经是回复，将 parent_id 提到祖父（合并到第 2 层）
      body.parent_id = parent.parent_id;
    }
  }

  // 审核策略
  let status: 'pending' | 'approved' = 'pending';
  let warning: string | null = null;
  if (user) {
    status = 'approved';
  } else {
    const ipHash = makeVisitorHash(ip, 'comment');
    // 检查是否曾批准过
    const prevApproved = db
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.ipHash, ipHash),
          eq(schema.comments.status, 'approved'),
          body.author_email
            ? eq(schema.comments.authorEmail, body.author_email)
            : eq(schema.comments.id, -1)
        )
      )
      .get();
    if (prevApproved) status = 'approved';
  }

  // 敏感词
  const hits = detectSensitive(body.content);
  if (hits.length > 0) {
    status = 'pending';
    warning = `Sensitive content: ${hits.join(', ')}`;
  }

  const ipHash = makeVisitorHash(ip, 'comment');
  const now = new Date().toISOString();
  const inserted = db
    .insert(schema.comments)
    .values({
      targetType: body.target_type,
      targetId: body.target_id,
      parentId: body.parent_id ?? null,
      authorName: body.author_name,
      authorEmail: body.author_email ?? null,
      authorId: user?.id ?? null,
      authorRole: user?.role ?? null,
      content: body.content,
      status,
      ipHash,
      userAgent: c.req.header('user-agent') ?? null,
      createdAt: now,
    })
    .returning()
    .get();

  // 计数同步
  if (status === 'approved') {
    if (body.target_type === 'post') {
      db.update(schema.posts)
        .set({ commentCount: sql`${schema.posts.commentCount} + 1` })
        .where(eq(schema.posts.id, body.target_id))
        .run();
    } else {
      db.update(schema.vibeNotes)
        .set({ commentCount: sql`${schema.vibeNotes.commentCount} + 1` })
        .where(eq(schema.vibeNotes.id, body.target_id))
        .run();
    }
  }

  return c.json(
    {
      ok: true,
      data: {
        ...inserted,
        _warning: warning,
        _status_message:
          status === 'pending'
            ? '您的评论已提交，正在等待审核。'
            : '评论已发布',
      },
    },
    201
  );
});

// ----------------------------------------------------------------------------
// 获取目标的评论列表（仅 approved）
// ----------------------------------------------------------------------------

commentsRouter.get('/:targetType/:targetId', async (c) => {
  const db = getDb();
  const targetType = c.req.param('targetType') as 'post' | 'vibe';
  const targetId = Number(c.req.param('targetId'));

  if (targetType !== 'post' && targetType !== 'vibe') {
    return c.json({ ok: false, error: 'Invalid target type' }, 400);
  }

  const rows = db
    .select()
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.targetType, targetType),
        eq(schema.comments.targetId, targetId),
        eq(schema.comments.status, 'approved')
      )
    )
    .orderBy(desc(schema.comments.createdAt))
    .all();

  // 构建树形结构（最多 2 层）
  const byId = new Map<number, any>();
  const top: any[] = [];
  rows.forEach((r) => byId.set(r.id, { ...r, replies: [] }));
  byId.forEach((c) => {
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId).replies.push(c);
    } else {
      top.push(c);
    }
  });

  return c.json({ ok: true, data: top });
});

// ----------------------------------------------------------------------------
// 审核（editor+）
// ----------------------------------------------------------------------------

const moderateSchema = z.object({
  action: z.enum(['approve', 'reject', 'spam']),
});

commentsRouter.patch(
  '/:id/moderate',
  requireRole('editor'),
  zValidator('json', moderateSchema),
  async (c) => {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const body = c.req.valid('json');
    const existing = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
    if (!existing) return c.json({ ok: false, error: 'Not found' }, 404);

    const newStatus =
      body.action === 'approve' ? 'approved' : body.action === 'spam' ? 'spam' : 'rejected';

    // 仅从 pending → approved 时增加计数
    const wasApproved = existing.status === 'approved';
    const willBeApproved = newStatus === 'approved';

    db.update(schema.comments)
      .set({ status: newStatus })
      .where(eq(schema.comments.id, id))
      .run();

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
  }
);

// ----------------------------------------------------------------------------
// 待审核列表（editor+）
// ----------------------------------------------------------------------------

commentsRouter.get('/_pending/list', requireRole('editor'), async (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.status, 'pending'))
    .orderBy(desc(schema.comments.createdAt))
    .limit(200)
    .all();
  return c.json({ ok: true, data: rows });
});

// ----------------------------------------------------------------------------
// 删除
// ----------------------------------------------------------------------------

commentsRouter.delete('/:id', requireAuth(), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const user = c.get('user')!;
  const existing = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
  if (!existing) return c.json({ ok: false, error: 'Not found' }, 404);

  const canEdit =
    user.role === 'admin' ||
    user.role === 'editor' ||
    (existing.authorId && existing.authorId === user.id);
  if (!canEdit) return c.json({ ok: false, error: 'Forbidden' }, 403);

  db.delete(schema.comments).where(eq(schema.comments.id, id)).run();
  if (existing.status === 'approved') {
    if (existing.targetType === 'post') {
      db.update(schema.posts)
        .set({ commentCount: sql`max(0, ${schema.posts.commentCount} - 1)` })
        .where(eq(schema.posts.id, existing.targetId))
        .run();
    } else {
      db.update(schema.vibeNotes)
        .set({ commentCount: sql`max(0, ${schema.vibeNotes.commentCount} - 1)` })
        .where(eq(schema.vibeNotes.id, existing.targetId))
        .run();
    }
  }
  return c.json({ ok: true, data: { id } });
});