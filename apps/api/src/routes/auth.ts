/**
 * Auth 路由（API 契约）。
 *
 * POST /api/v1/auth/register   申请 author / 游客评论身份
 * POST /api/v1/auth/login      登录（5 次失败锁定 15 分钟）
 * POST /api/v1/auth/logout     登出
 * GET  /api/v1/auth/me         当前登录用户信息
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import {
  SESSION_DAYS,
  clearLoginAttempts,
  clearSessionCookie,
  expiryDate,
  isLockedOut,
  purgeExpiredSessions,
  recordFailedLogin,
  requireAuth,
  requireRole,
  setSessionCookie,
} from '../middleware/session.js';
import { generateToken } from '../utils/crypto.js';

export const authRouter = new Hono();

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60_000).unref();

// ----------------------------------------------------------------------------
// 注册：MVP 默认创建 reader 角色，管理员可在后台提权
// ----------------------------------------------------------------------------

const registerSchema = z.object({
  email: z.string().email().max(200),
  username: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(200),
  display_name: z.string().max(80).optional(),
});

authRouter.post('/register', zValidator('json', registerSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');

  const dup = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email))
    .get();
  if (dup) return c.json({ ok: false, error: 'Email already registered' }, 409);

  const dupName = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, body.username))
    .get();
  if (dupName) return c.json({ ok: false, error: 'Username taken' }, 409);

  const password_hash = await hashPassword(body.password);
  const now = new Date().toISOString();
  const inserted = db
    .insert(schema.users)
    .values({
      email: body.email,
      username: body.username,
      passwordHash: password_hash,
      displayName: body.display_name ?? body.username,
      role: 'reader',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // 自动登录
  const sid = generateToken(32);
  db.insert(schema.sessions)
    .values({
      id: sid,
      userId: inserted.id,
      expiresAt: expiryDate(),
      createdAt: now,
    })
    .run();
  setSessionCookie(c, sid, SESSION_DAYS);

  return c.json({ ok: true, data: publicUser(inserted) }, 201);
});

// ----------------------------------------------------------------------------
// 登录
// ----------------------------------------------------------------------------

const loginSchema = z.object({
  identifier: z.string().min(1), // email 或 username
  password: z.string().min(1),
});

authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const key = body.identifier.toLowerCase();
  const lockKey = `login:${key}`;
  if (isLockedOut(lockKey)) {
    return c.json({ ok: false, error: 'Too many attempts. Try again later.' }, 429);
  }

  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.identifier))
    .get() ??
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, body.identifier))
      .get();

  if (!user || user.status !== 'active') {
    recordFailedLogin(lockKey);
    return c.json({ ok: false, error: 'Invalid credentials' }, 401);
  }

  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    recordFailedLogin(lockKey);
    return c.json({ ok: false, error: 'Invalid credentials' }, 401);
  }

  clearLoginAttempts(lockKey);
  const sid = generateToken(32);
  const now = new Date().toISOString();
  db.insert(schema.sessions)
    .values({
      id: sid,
      userId: user.id,
      expiresAt: expiryDate(),
      userAgent: c.req.header('user-agent') ?? null,
      ipHash: null,
      createdAt: now,
    })
    .run();
  db.update(schema.users)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(schema.users.id, user.id))
    .run();

  setSessionCookie(c, sid, SESSION_DAYS);
  return c.json({ ok: true, data: publicUser(user) });
});

// ----------------------------------------------------------------------------
// 登出
// ----------------------------------------------------------------------------

authRouter.post('/logout', async (c) => {
  const cookie = c.req.header('Cookie') ?? '';
  const match = cookie.match(/myblog_session=([^;]+)/);
  if (match) {
    const db = getDb();
    db.delete(schema.sessions).where(eq(schema.sessions.id, match[1])).run();
  }
  clearSessionCookie(c);
  return c.json({ ok: true, data: { loggedOut: true } });
});

// ----------------------------------------------------------------------------
// 当前用户
// ----------------------------------------------------------------------------

authRouter.get('/me', requireAuth(), async (c) => {
  return c.json({ ok: true, data: publicUser(c.get('user')!) });
});

// Debug 端点（admin 可见）：返回服务端实际收到的 cookie + session 解析结果
authRouter.get('/_debug/session', requireRole('admin'), async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? '';
  const match = cookieHeader.match(/myblog_session=([^;]+)/);
  const sid = match?.[1];
  const db = getDb();
  const sess = sid ? db.select().from(schema.sessions).where(eq(schema.sessions.id, sid)).get() : null;
  const user = c.get('user');
  return c.json({
    ok: true,
    data: {
      cookieHeaderReceived: cookieHeader || '(空)',
      sidExtracted: sid ?? '(未提取到)',
      sessionInDb: sess ? { id: sess.id, userId: sess.userId, expiresAt: sess.expiresAt } : null,
      userInjectedByMiddleware: user ? { id: user.id, username: user.username, role: user.role } : null,
    },
  });
});

// ----------------------------------------------------------------------------
// 工具
// ----------------------------------------------------------------------------

function publicUser(u: schema.UserRow) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    display_name: u.displayName,
    avatar_url: u.avatarUrl,
    role: u.role,
    bio: u.bio,
    status: u.status,
    last_login_at: u.lastLoginAt,
    created_at: u.createdAt,
  };
}