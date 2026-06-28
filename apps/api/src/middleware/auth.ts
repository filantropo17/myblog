/**
 * AI API Key 鉴权 + 审计日志。
 */
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getDb, schema } from '../db/index.js';

export const AI_KEY_HEADER = 'X-AI-API-Key';

export const aiAuth: MiddlewareHandler = async (c: Context, next: Next) => {
  const key = c.req.header(AI_KEY_HEADER);
  const expected = process.env.AI_API_KEY;

  if (!expected) {
    return c.json({ ok: false, error: 'AI_API_KEY not configured on server' }, 500);
  }

  if (key !== expected) {
    return c.json({ ok: false, error: 'Invalid AI API Key' }, 401);
  }

  return await next();
};

export const adminAuth: MiddlewareHandler = async (c: Context, next: Next) => {
  const user = c.req.header('X-Admin-User');
  const pass = c.req.header('X-Admin-Pass');
  const sessionHeader = c.req.header('X-Admin-Session');
  const cookie = c.req.header('Cookie') ?? '';
  const match = cookie.match(/admin_session=([^;]+)/);
  const sessionOk =
    sessionHeader === expectedAdminToken() || match?.[1] === expectedAdminToken();

  const ok =
    sessionOk ||
    (user === process.env.ADMIN_USERNAME && pass === process.env.ADMIN_PASSWORD);

  if (!ok) {
    return c.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  return await next();
};

function expectedAdminToken(): string {
  // 从凭据派生的静态 token（通过修改环境变量来轮换即可）。
  return `myblog_admin_${process.env.ADMIN_USERNAME ?? 'admin'}`;
}

export function adminLogin(user: string, pass: string): { token: string } | null {
  if (user !== process.env.ADMIN_USERNAME) return null;
  if (pass !== process.env.ADMIN_PASSWORD) return null;
  return { token: expectedAdminToken() };
}

// ----------------------------------------------------------------------------
// 审计日志辅助函数
// ----------------------------------------------------------------------------

export async function audit(c: Context, status: number) {
  try {
    const db = getDb();
    const payloadSummary = summarizePayload(c);
    db.insert(schema.aiAuditLogs)
      .values({
        endpoint: c.req.path,
        method: c.req.method,
        payloadSummary,
        responseStatus: status,
        latencyMs: 0, // 由 timing 中间件更新
        ipAddress: clientIp(c),
      })
      .run();
  } catch {
    // 永远不要让审计失败影响请求
  }
}

function summarizePayload(c: Context): string {
  // 为保护隐私，仅记录键名与截断后的值
  try {
    const body = (c as any)._aiBody;
    if (!body || typeof body !== 'object') return '';
    const keys = Object.keys(body).join(',');
    return keys.slice(0, 200);
  } catch {
    return '';
  }
}

function clientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

export function timingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const latency = Date.now() - start;
    // 仅对 /api/v1/ 下的路径更新
    if (c.req.path.startsWith('/api/v1/')) {
      try {
        const db = getDb();
        // 更新该端点最近的审计日志行
        // (尽力而为；非关键)
        db.$client.exec(
          `UPDATE ai_audit_logs SET latency_ms = ${latency} WHERE id = (SELECT MAX(id) FROM ai_audit_logs WHERE endpoint = '${c.req.path.replace(/'/g, "''")}' AND method = '${c.req.method}')`
        );
      } catch {
        // 忽略
      }
    }
  };
}
