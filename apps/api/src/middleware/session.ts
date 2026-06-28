/**
 * Session-based 鉴权中间件。
 *
 * - 读 `myblog_session` cookie → 查 sessions 表 → 注入 c.set('user', user)
 * - 过期自动滑窗续期（活跃时延长 7 天）
 * - 登录失败 5 次锁定 15 分钟（内存 Map）
 */
import type { Context, MiddlewareHandler, Next } from 'hono';
import { eq, lt } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import type { UserRow } from '../db/schema.js';

// 在 Context 上扩展 user
declare module 'hono' {
  interface ContextVariableMap {
    user?: UserRow;
  }
}

export const SESSION_COOKIE = 'myblog_session';
export const SESSION_DAYS = 7;

/** 计算过期时间（ISO）。 */
export function expiryDate(days = SESSION_DAYS): string {
  return new Date(Date.now() + days * 86400 * 1000).toISOString();
}

/** 清理过期 session。 */
export function purgeExpiredSessions() {
  try {
    const db = getDb();
    db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date().toISOString())).run();
  } catch {
    // 忽略
  }
}

/** 仅注入 user，不强制要求登录。 */
export const sessionMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  const cookie = c.req.header('Cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  const sid = match?.[1];
  if (!sid) return await next();

  const db = getDb();
  const sess = db.select().from(schema.sessions).where(eq(schema.sessions.id, sid)).get();
  if (!sess) return await next();

  // 过期：清理并跳过
  if (new Date(sess.expiresAt).getTime() < Date.now()) {
    db.delete(schema.sessions).where(eq(schema.sessions.id, sid)).run();
    return await next();
  }

  const user = db.select().from(schema.users).where(eq(schema.users.id, sess.userId)).get();
  if (!user || user.status !== 'active') return await next();

  // 滑窗续期：剩余 < 2 天时自动延长
  const remaining = new Date(sess.expiresAt).getTime() - Date.now();
  if (remaining < 2 * 86400 * 1000) {
    db.update(schema.sessions)
      .set({ expiresAt: expiryDate() })
      .where(eq(schema.sessions.id, sid))
      .run();
  }

  c.set('user', user);
  return await next();
};

/** 工具：设置 session cookie。 */
export function setSessionCookie(c: Context, sid: string, days = SESSION_DAYS) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE}=${sid}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${days * 86400}`,
  ];
  if (isProd) parts.push('Secure');
  c.header('Set-Cookie', parts.join('; '));
}

/** 工具：清除 session cookie。 */
export function clearSessionCookie(c: Context) {
  c.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ----------------------------------------------------------------------------
// 角色守卫工厂// ----------------------------------------------------------------------------

const ROLE_RANK: Record<string, number> = { reader: 1, author: 2, editor: 3, admin: 4 };

/** 要求登录。 */
export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    if (!c.get('user')) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    return await next();
  };
}

/** 要求最低角色。 */
export function requireRole(minRole: keyof typeof ROLE_RANK): MiddlewareHandler {
  const minRank = ROLE_RANK[minRole];
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    if ((ROLE_RANK[user.role] ?? 0) < minRank) {
      return c.json({ ok: false, error: 'Forbidden' }, 403);
    }
    return await next();
  };
}

// ----------------------------------------------------------------------------
// 登录失败锁定：5 次失败 → 锁定 15 分钟
// ----------------------------------------------------------------------------

interface LoginAttempt {
  count: number;
  lockedUntil?: number;
}
const loginAttempts = new Map<string, LoginAttempt>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

export function isLockedOut(key: string): boolean {
  const a = loginAttempts.get(key);
  if (!a?.lockedUntil) return false;
  if (Date.now() > a.lockedUntil) {
    loginAttempts.delete(key);
    return false;
  }
  return true;
}

export function recordFailedLogin(key: string) {
  const a = loginAttempts.get(key) ?? { count: 0 };
  a.count++;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = Date.now() + LOCK_MS;
    a.count = 0; // 锁定后清零计数
  }
  loginAttempts.set(key, a);
}

export function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}