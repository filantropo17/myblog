/**
 * 通用 Reactions 路由。
 *
 * POST /api/v1/reactions/:targetType/:targetId   点赞/反应（toggle）
 * GET  /api/v1/reactions/:targetType/:targetId   统计
 *
 * 业务规则：
 * - 登录用户按 user_id 去重
 * - 游客按 visitor_hash (SHA256(ip+ua)) 去重
 * - 同一目标同一反应类型仅一次
 */
import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { visitorHash as makeVisitorHash } from '../utils/crypto.js';

export const reactionsRouter = new Hono();

function ipFrom(c: any) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

const ALLOWED = new Set(['post', 'vibe', 'comment']);

reactionsRouter.post('/:targetType/:targetId', async (c) => {
  const db = getDb();
  const targetType = c.req.param('targetType') as 'post' | 'vibe' | 'comment';
  const targetId = Number(c.req.param('targetId'));
  if (!ALLOWED.has(targetType)) return c.json({ ok: false, error: 'Invalid target' }, 400);
  if (!targetId) return c.json({ ok: false, error: 'Invalid id' }, 400);

  // 可选 reaction 类型（默认 like）
  let reaction = 'like';
  try {
    const body = await c.req.json().catch(() => null);
    if (body?.reaction && ['like', 'love', 'insightful'].includes(body.reaction)) {
      reaction = body.reaction;
    }
  } catch {
    // 无 body 也允许
  }

  const user = c.get('user');
  const visitor = user ? null : makeVisitorHash(ipFrom(c), 'reaction');

  // 去重查询
  let existing: { id: number } | undefined;
  if (user) {
    existing = db
      .select({ id: schema.reactions.id })
      .from(schema.reactions)
      .where(
        and(
          eq(schema.reactions.targetType, targetType),
          eq(schema.reactions.targetId, targetId),
          eq(schema.reactions.userId, user.id),
          eq(schema.reactions.reaction, reaction as any)
        )
      )
      .get();
  } else {
    existing = db
      .select({ id: schema.reactions.id })
      .from(schema.reactions)
      .where(
        and(
          eq(schema.reactions.targetType, targetType),
          eq(schema.reactions.targetId, targetId),
          eq(schema.reactions.visitorHash, visitor!),
          eq(schema.reactions.reaction, reaction as any)
        )
      )
      .get();
  }

  let liked: boolean;
  if (existing) {
    db.delete(schema.reactions).where(eq(schema.reactions.id, existing.id)).run();
    liked = false;
  } else {
    db.insert(schema.reactions)
      .values({
        targetType,
        targetId,
        userId: user?.id ?? null,
        visitorHash: visitor,
        reaction: reaction as any,
        createdAt: new Date().toISOString(),
      })
      .run();
    liked = true;
  }

  // 同步 count
  const { count } = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.reactions)
    .where(
      and(
        eq(schema.reactions.targetType, targetType),
        eq(schema.reactions.targetId, targetId),
        eq(schema.reactions.reaction, reaction as any)
      )
    )
    .get() ?? { count: 0 };

  // 同步目标的 like_count 缓存列
  if (targetType === 'post') {
    db.update(schema.posts)
      .set({ likeCount: count })
      .where(eq(schema.posts.id, targetId))
      .run();
  } else if (targetType === 'vibe') {
    db.update(schema.vibeNotes)
      .set({ likeCount: count })
      .where(eq(schema.vibeNotes.id, targetId))
      .run();
  }

  return c.json({ ok: true, data: { liked, count, reaction } });
});

reactionsRouter.get('/:targetType/:targetId', async (c) => {
  const db = getDb();
  const targetType = c.req.param('targetType') as 'post' | 'vibe' | 'comment';
  const targetId = Number(c.req.param('targetId'));
  if (!ALLOWED.has(targetType)) return c.json({ ok: false, error: 'Invalid target' }, 400);

  const rows = db
    .select({ reaction: schema.reactions.reaction })
    .from(schema.reactions)
    .where(
      and(eq(schema.reactions.targetType, targetType), eq(schema.reactions.targetId, targetId))
    )
    .all();

  const counts: Record<string, number> = { like: 0, love: 0, insightful: 0 };
  for (const r of rows) counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;

  return c.json({ ok: true, data: counts });
});