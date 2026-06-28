/**
 * 订阅 Newsletter。
 *
 * POST /api/v1/subscribers       提交邮箱（双确认：返回 confirm_token）
 * GET  /api/v1/subscribers/confirm?token=...
 * GET  /api/v1/subscribers/unsubscribe?token=...
 *
 * 邮件发送降级：未配置 SMTP 时，confirm_token 直接在响应里返回（仅 dev）。
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { generateToken } from '../utils/crypto.js';

export const subscribersRouter = new Hono();

const subscribeSchema = z.object({
  email: z.string().email().max(200),
  source: z.string().max(100).optional(),
});

subscribersRouter.post('/', zValidator('json', subscribeSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const email = body.email.toLowerCase().trim();

  const existing = db.select().from(schema.subscribers).where(eq(schema.subscribers.email, email)).get();

  const confirmToken = generateToken(24);
  const unsubToken = generateToken(24);
  const now = new Date().toISOString();

  if (existing) {
    // 已存在：若是 unsubscribed 则复活；否则返回 confirm_token 提示已订阅
    if (existing.status === 'unsubscribed') {
      db.update(schema.subscribers)
        .set({
          status: 'pending',
          confirmToken,
          unsubscribeToken: unsubToken,
          source: body.source ?? null,
        })
        .where(eq(schema.subscribers.id, existing.id))
        .run();
    }
    return c.json({
      ok: true,
      data: {
        email,
        status: existing.status === 'unsubscribed' ? 'pending' : existing.status,
        message: existing.status === 'confirmed' ? '已订阅' : '请查收确认邮件',
      },
    });
  }

  db.insert(schema.subscribers)
    .values({
      email,
      confirmToken,
      unsubscribeToken: unsubToken,
      status: 'pending',
      source: body.source ?? null,
      createdAt: now,
    })
    .run();

  // 降级：未配 SMTP 时直接把 confirm_token 返回给客户端
  // 生产环境：在此处通过 SMTP 发送包含 ?token=... 的链接
  const smtpEnabled = !!process.env.SMTP_HOST;
  return c.json({
    ok: true,
    data: {
      email,
      status: 'pending',
      confirm_url: smtpEnabled
        ? null
        : `/api/v1/subscribers/confirm?token=${confirmToken}`,
    },
  });
});

subscribersRouter.get('/confirm', async (c) => {
  const db = getDb();
  const token = c.req.query('token');
  if (!token) return c.json({ ok: false, error: 'Missing token' }, 400);

  const sub = db
    .select()
    .from(schema.subscribers)
    .where(eq(schema.subscribers.confirmToken, token))
    .get();
  if (!sub) return c.json({ ok: false, error: 'Invalid token' }, 404);

  db.update(schema.subscribers)
    .set({ status: 'confirmed', confirmedAt: new Date().toISOString() })
    .where(eq(schema.subscribers.id, sub.id))
    .run();

  return c.json({ ok: true, data: { email: sub.email, status: 'confirmed' } });
});

subscribersRouter.get('/unsubscribe', async (c) => {
  const db = getDb();
  const token = c.req.query('token');
  if (!token) return c.json({ ok: false, error: 'Missing token' }, 400);

  const sub = db
    .select()
    .from(schema.subscribers)
    .where(eq(schema.subscribers.unsubscribeToken, token))
    .get();
  if (!sub) return c.json({ ok: false, error: 'Invalid token' }, 404);

  db.update(schema.subscribers)
    .set({ status: 'unsubscribed' })
    .where(eq(schema.subscribers.id, sub.id))
    .run();

  return c.json({ ok: true, data: { email: sub.email, status: 'unsubscribed' } });
});