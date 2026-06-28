/**
 * 对话 AI 管理（后台 AI 控制扩展）。
 *
 * GET   /api/v1/admin/llm-config         读当前配置（API key 完整返回，管理员界面不外放）
 * PUT   /api/v1/admin/llm-config         保存配置（settings 表）→ 立即失效 LLM 缓存
 * POST  /api/v1/admin/llm-config/test    真实验证：发最小 chat 请求，返 ok/latencyMs/error
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { requireRole } from '../middleware/session.js';
import { _resetLlmClient, readLlmConfig } from '../services/llm.js';
import { audit } from '../middleware/auth.js';

export const llmConfigRouter = new Hono();

// 与 admin.ts 一致：editor+ 角色即可（管理员、editor）
llmConfigRouter.use('*', requireRole('editor'));

const KEYS = ['llm.enabled', 'llm.base_url', 'llm.api_key', 'llm.model', 'llm.timeout_ms'] as const;

/** 把 settings 表 + env 合并后的视图返回给前端。 */
llmConfigRouter.get('/llm-config', async (c) => {
  const cfg = await readLlmConfig();
  const db = getDb();

  // 取 settings 原始值（可能为空 → 显示为空 input）
  const setMap: Record<string, string> = {};
  for (const k of KEYS) {
    const r = db.select().from(schema.settings).where(eq(schema.settings.key, k)).get();
    if (r) setMap[k] = r.value;
  }

  // 当前生效值：settings 优先 → env fallback
  const enabled = setMap['llm.enabled'] ?? (cfg?.enabled ? 'true' : 'false');
  const baseUrl = setMap['llm.base_url'] ?? cfg?.baseUrl ?? '';
  const apiKey = setMap['llm.api_key'] ?? cfg?.apiKey ?? '';
  const model = setMap['llm.model'] ?? cfg?.model ?? '';
  const timeoutMs = setMap['llm.timeout_ms'] ?? String(cfg?.timeoutMs ?? 30_000);

  return c.json({
    ok: true,
    data: {
      enabled: enabled === 'true',
      base_url: baseUrl,
      api_key: apiKey,
      model,
      timeout_ms: Number(timeoutMs) || 30_000,
      source: cfg?.source ?? null, // 用于在前端展示「当前生效值来自 settings 还是 env」
      active: !!cfg,
    },
  });
});

/** 保存配置 → settings 表 → 立即失效 LLM 缓存。 */
const saveSchema = z.object({
  enabled: z.boolean(),
  base_url: z.string().max(500),
  api_key: z.string().max(500),
  model: z.string().max(200),
  timeout_ms: z.number().int().min(1000).max(300_000),
});

llmConfigRouter.put('/llm-config', zValidator('json', saveSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const now = new Date().toISOString();
  const upserts: Array<{ key: string; value: string }> = [
    { key: 'llm.enabled', value: body.enabled ? 'true' : 'false' },
    { key: 'llm.base_url', value: body.base_url.trim() },
    { key: 'llm.api_key', value: body.api_key.trim() },
    { key: 'llm.model', value: body.model.trim() },
    { key: 'llm.timeout_ms', value: String(body.timeout_ms) },
  ];

  for (const u of upserts) {
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, u.key)).get();
    if (existing) {
      db.update(schema.settings)
        .set({ value: u.value, updatedAt: now })
        .where(eq(schema.settings.key, u.key))
        .run();
    } else {
      db.insert(schema.settings).values({ key: u.key, value: u.value, updatedAt: now }).run();
    }
  }

  // 立即失效缓存，下一条 chat 消息用新配置
  _resetLlmClient();

  await audit(c, 200);
  return c.json({ ok: true, data: { saved: true } });
});

/** 真实验证：发最小 chat 请求。 */
llmConfigRouter.post('/llm-config/test', async (c) => {
  // 读最新配置（settings 优先 → env fallback）
  const cfg = await readLlmConfig();
  if (!cfg) {
    return c.json({
      ok: false,
      error: '未配置 LLM（需要 enabled=true 且 base_url/api_key/model 都填写）',
    }, 400);
  }

  const start = Date.now();
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      await audit(c, res.status);
      return c.json({
        ok: false,
        error: `${res.status} ${text.slice(0, 200)}`,
        latency_ms: latencyMs,
      });
    }

    await audit(c, 200);
    return c.json({
      ok: true,
      data: {
        ok: true,
        latency_ms: latencyMs,
        model: cfg.model,
        base_url: cfg.baseUrl,
      },
    });
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    await audit(c, 500);
    return c.json({
      ok: false,
      error: err?.message ?? String(err),
      latency_ms: latencyMs,
    });
  }
});