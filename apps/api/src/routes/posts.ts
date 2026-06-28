/**
 * 文章路由 — 公共读取与管理端 CRUD。
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, asc, sql, like, and, or } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { rowToPost } from '../utils/sensitive.js';
import { generateSlug } from '../utils/slug.js';
import { generateExcerpt } from '../utils/reading.js';
import { aiAuth, adminAuth, audit, AI_KEY_HEADER } from '../middleware/auth.js';
import { rateLimit, startRateLimitCleanup } from '../middleware/rate-limit.js';
import { requireRole } from '../middleware/session.js';
import { normalizeManual, detectSensitive } from '../services/ai-content.js';

startRateLimitCleanup();

function makeUniqueSlug(db: any, baseSlug: string): string {
  let slug = baseSlug;
  let i = 1;
  while (db.select().from(schema.posts).where(eq(schema.posts.slug, slug)).get()) {
    slug = `${baseSlug}-${++i}`;
  }
  return slug;
}

export const postsRouter = new Hono();

// ----------------------------------------------------------------------------
// 公共接口：列出与获取已发布文章（无需鉴权）
// ----------------------------------------------------------------------------

postsRouter.get('/', async (c) => {
  const db = getDb();
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);
  const category = c.req.query('category');
  const tag = c.req.query('tag');
  const q = c.req.query('q');

  const conditions: any[] = [eq(schema.posts.status, 'published')];
  if (category) conditions.push(eq(schema.posts.category, category as any));
  if (q) {
    conditions.push(
      or(like(schema.posts.title, `%${q}%`), like(schema.posts.excerpt, `%${q}%`))
    );
  }

  const rows = db
    .select()
    .from(schema.posts)
    .where(and(...conditions))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(limit)
    .offset(offset)
    .all();

  let filtered = rows;
  if (tag) {
    filtered = rows.filter((r) => {
      try {
        return (JSON.parse(r.tags) as string[]).includes(tag);
      } catch {
        return false;
      }
    });
  }

  return c.json({ ok: true, data: filtered.map(rowToPost) });
});

postsRouter.get('/tags', async (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.status, 'published'))
    .all();
  const tagCount: Record<string, number> = {};
  for (const r of rows) {
    try {
      const tags = JSON.parse(r.tags) as string[];
      for (const t of tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
    } catch {
      // 忽略
    }
  }
  return c.json({
    ok: true,
    data: Object.entries(tagCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  });
});

postsRouter.get('/:slug', async (c) => {
  const db = getDb();
  const slug = c.req.param('slug');
  const row = db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.slug, slug), eq(schema.posts.status, 'published')))
    .get();
  if (!row) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true, data: rowToPost(row) });
});

// ----------------------------------------------------------------------------
// 管理端：草稿与完整 CRUD
// ----------------------------------------------------------------------------

postsRouter.get('/admin/all', requireRole('editor'), async (c) => {
  const db = getDb();
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);

  const conditions: any[] = [];
  if (status) conditions.push(eq(schema.posts.status, status as any));

  const rows = db
    .select()
    .from(schema.posts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.posts.updatedAt))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json({ ok: true, data: rows.map(rowToPost) });
});

postsRouter.patch(
  '/admin/:id',
  requireRole('editor'),
  zValidator(
    'json',
    z.object({
      title: z.string().max(200).optional(),
      content: z.string().optional(),
      excerpt: z.string().optional(),
      category: z.enum(['tech', 'project', 'diary']).optional(),
      tags: z.array(z.string()).optional(),
      status: z.enum(['draft', 'published', 'rejected']).optional(),
      seo_description: z.string().max(300).optional(),
      cover_image_url: z.string().optional(),
    })
  ),
  async (c) => {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const body = c.req.valid('json');

    const existing = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
    if (!existing) return c.json({ ok: false, error: 'Not found' }, 404);

    // 当内容变更时记录版本历史
    if (body.content && body.content !== existing.content) {
      db.insert(schema.postVersions)
        .values({
          postId: id,
          content: existing.content,
          editedBy: 'admin',
          changeSummary: 'Manual edit',
        })
        .run();
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) {
      updates.content = body.content;
      if (!body.excerpt && !existing.excerpt) {
        updates.excerpt = generateExcerpt(body.content);
      }
    }
    if (body.excerpt !== undefined) updates.excerpt = body.excerpt;
    if (body.category !== undefined) updates.category = body.category;
    if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'published' && !existing.publishedAt) {
        updates.publishedAt = new Date().toISOString();
      }
    }
    if (body.seo_description !== undefined) updates.seoDescription = body.seo_description;
    if (body.cover_image_url !== undefined) updates.coverImageUrl = body.cover_image_url;

    db.update(schema.posts).set(updates).where(eq(schema.posts.id, id)).run();

    const updated = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
    return c.json({ ok: true, data: rowToPost(updated!) });
  }
);

postsRouter.delete('/admin/:id', requireRole('editor'), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  db.delete(schema.posts).where(eq(schema.posts.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

postsRouter.get('/admin/:id/versions', requireRole('editor'), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const versions = db
    .select()
    .from(schema.postVersions)
    .where(eq(schema.postVersions.postId, id))
    .orderBy(desc(schema.postVersions.createdAt))
    .all();
  return c.json({ ok: true, data: versions });
});

// ----------------------------------------------------------------------------
// AI：创建文章（鉴权 + 限流 + 审计）
// ----------------------------------------------------------------------------

const writeRateLimit = async (c: any, next: any) => {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown';
  const max = Number(process.env.RATE_LIMIT_WRITES_PER_MINUTE ?? 30);
  if (!rateLimit(ip, max)) {
    return c.json({ ok: false, error: 'Rate limit exceeded' }, 429);
  }
  return await next();
};

const manualSchema = z.object({
  title: z.string().max(200),
  content: z.string(),
  source_type: z.literal('manual'),
  source_meta: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(['tech', 'project', 'diary']).optional(),
  seo_description: z.string().max(300).optional(),
  cover_image_url: z.string().optional(),
});

postsRouter.post('/', aiAuth, writeRateLimit, zValidator('json', manualSchema), async (c) => {
  const db = getDb();
  const input = c.req.valid('json');
  (c as any)._aiBody = input;
  const draft = normalizeManual(input);

  const hits = detectSensitive(draft.content);
  const status: any = hits.length > 0 ? 'draft' : 'draft';

  const now = new Date().toISOString();
  // 先插入以拿到 id，再根据 title 与 id 生成 slug
  const inserted = db
    .insert(schema.posts)
    .values({
      title: draft.title,
      slug: 'tmp', // 稍后会更新
      content: draft.content,
      excerpt: generateExcerpt(draft.content),
      category: draft.category,
      tags: JSON.stringify(draft.tags),
      status,
      sourceType: 'manual',
      sourceMeta: JSON.stringify(draft.source_meta),
      seoDescription: draft.seo_description,
      coverImageUrl: input.cover_image_url,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  const uniqueSlug = makeUniqueSlug(db, generateSlug(draft.title, inserted.id));
  db.update(schema.posts).set({ slug: uniqueSlug }).where(eq(schema.posts.id, inserted.id)).run();
  inserted.slug = uniqueSlug;

  db.insert(schema.postVersions)
    .values({
      postId: inserted.id,
      content: draft.content,
      editedBy: 'ai',
      changeSummary: 'Initial AI generation',
    })
    .run();

  await audit(c, 201);

  return c.json(
    {
      ok: true,
      data: { ...rowToPost(inserted), _warning: hits.length > 0 ? 'Sensitive content detected' : null },
    },
    201
  );
});

// Editor 创建文章（后台手动新建草稿）— 复用 manualSchema
postsRouter.post(
  '/manual',
  requireRole('editor'),
  zValidator('json', manualSchema),
  async (c) => {
    const db = getDb();
    const input = c.req.valid('json');
    const now = new Date().toISOString();

    const inserted = db
      .insert(schema.posts)
      .values({
        title: input.title,
        slug: 'tmp',
        content: input.content,
        excerpt: generateExcerpt(input.content),
        category: input.category,
        tags: JSON.stringify(input.tags ?? []),
        status: 'draft',
        sourceType: 'manual',
        sourceMeta: JSON.stringify(input.source_meta ?? {}),
        seoDescription: input.seo_description,
        coverImageUrl: input.cover_image_url,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const uniqueSlug = makeUniqueSlug(db, generateSlug(input.title, inserted.id));
    db.update(schema.posts).set({ slug: uniqueSlug }).where(eq(schema.posts.id, inserted.id)).run();
    inserted.slug = uniqueSlug;

    db.insert(schema.postVersions)
      .values({
        postId: inserted.id,
        content: input.content,
        editedBy: 'admin',
        changeSummary: 'Manual editor create',
      })
      .run();

    return c.json({ ok: true, data: rowToPost(inserted) }, 201);
  }
);

// ----------------------------------------------------------------------------
// AI / 管理端：审核
// ----------------------------------------------------------------------------

const reviewSchema = z.object({
  action: z.enum(['publish', 'reject', 'request_revision']),
  feedback: z.string().optional(),
  edited_content: z.string().optional(),
});

postsRouter.patch('/:id/review', requireRole('editor'), zValidator('json', reviewSchema), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const body = c.req.valid('json');

  const existing = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  if (!existing) return c.json({ ok: false, error: 'Not found' }, 404);

  const now = new Date().toISOString();
  const updates: Record<string, any> = { updatedAt: now };

  if (body.action === 'publish') {
    updates.status = 'published';
    if (!existing.publishedAt) updates.publishedAt = now;
    if (body.edited_content) {
      updates.content = body.edited_content;
      updates.excerpt = generateExcerpt(body.edited_content);
      db.insert(schema.postVersions)
        .values({
          postId: id,
          content: body.edited_content,
          editedBy: 'admin',
          changeSummary: 'Review & publish with edits',
        })
        .run();
    }
  } else if (body.action === 'reject') {
    updates.status = 'rejected';
    updates.aiReviewFeedback = body.feedback ?? null;
  } else if (body.action === 'request_revision') {
    updates.status = 'draft';
    updates.aiReviewFeedback = body.feedback ?? null;
    if (body.edited_content) {
      updates.content = body.edited_content;
      db.insert(schema.postVersions)
        .values({
          postId: id,
          content: body.edited_content,
          editedBy: 'admin',
          changeSummary: `Revision requested: ${body.feedback ?? 'no feedback'}`,
        })
        .run();
    }
  }

  db.update(schema.posts).set(updates).where(eq(schema.posts.id, id)).run();
  const updated = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  return c.json({ ok: true, data: rowToPost(updated!) });
});
