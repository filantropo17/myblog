/**
 * 阅读量 / 来源追踪路由。
 *
 * POST /api/v1/track/view      阅读上报（Beacon）
 * POST /api/v1/track/duration  阅读时长上报
 *
 * 去重策略：同 visitor_hash + 同一天 + 同 target 只记一次。
 * 机器人过滤：UA 命中常见爬虫名单直接丢弃。
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { visitorHash as makeVisitorHash } from '../utils/crypto.js';

export const trackRouter = new Hono();

const BOT_RE =
  /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|baiduspider|googlebot|bingbot|yandex|duckduckbot|applebot|semrush|ahrefs|mj12|lighthouse|pagespeed/i;

function ipFrom(c: any) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

function refererSource(referer: string | null) {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    const host = u.hostname.toLowerCase();
    if (host.includes('github.com')) return 'github';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
    if (host.includes('weibo.com')) return 'weibo';
    if (host.includes('zhihu.com')) return 'zhihu';
    if (host.includes('google.com')) return 'google';
    if (host.includes('bing.com')) return 'bing';
    if (host.includes('baidu.com')) return 'baidu';
    if (host.includes('duckduckgo.com')) return 'duckduckgo';
    return host;
  } catch {
    return null;
  }
}

const viewSchema = z.object({
  target_type: z.enum(['post', 'vibe', 'page']),
  target_id: z.number().int().positive().optional(),
  path: z.string().min(1).max(500),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
  referer: z.string().max(500).optional(),
});

trackRouter.post('/view', zValidator('json', viewSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');

  // 机器人过滤
  const ua = c.req.header('user-agent') ?? '';
  if (BOT_RE.test(ua)) return c.json({ ok: true, data: { bot: true } });

  const ip = ipFrom(c);
  const visitorHash = makeVisitorHash(ip + '|' + (ua ?? ''), 'view');

  // 同一天 + 同 visitor + 同 target 去重
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const existing = db
    .select({ id: schema.pageViews.id })
    .from(schema.pageViews)
    .where(
      and(
        eq(schema.pageViews.visitorHash, visitorHash),
        eq(schema.pageViews.path, body.path),
        gte(schema.pageViews.createdAt, todayIso)
      )
    )
    .get();

  if (existing) {
    return c.json({ ok: true, data: { dedup: true } });
  }

  const now = new Date().toISOString();
  db.insert(schema.pageViews)
    .values({
      targetType: body.target_type,
      targetId: body.target_id ?? null,
      path: body.path,
      visitorHash,
      userAgent: ua || null,
      referer: body.referer ?? null,
      utmSource: body.utm_source ?? null,
      utmMedium: body.utm_medium ?? null,
      utmCampaign: body.utm_campaign ?? null,
      createdAt: now,
    })
    .run();

  // 同步目标的 view_count 缓存列
  if (body.target_type === 'post' && body.target_id) {
    db.update(schema.posts)
      .set({ viewCount: sql`${schema.posts.viewCount} + 1` })
      .where(eq(schema.posts.id, body.target_id))
      .run();
  } else if (body.target_type === 'vibe' && body.target_id) {
    db.update(schema.vibeNotes)
      .set({ viewCount: sql`${schema.vibeNotes.viewCount} + 1` })
      .where(eq(schema.vibeNotes.id, body.target_id))
      .run();
  }

  return c.json({ ok: true, data: { recorded: true } });
});

const durationSchema = z.object({
  path: z.string().min(1).max(500),
  duration_ms: z.number().int().nonnegative(),
});

trackRouter.post('/duration', zValidator('json', durationSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid('json');
  const ua = c.req.header('user-agent') ?? '';
  if (BOT_RE.test(ua)) return c.json({ ok: true, data: { bot: true } });

  const ip = ipFrom(c);
  const visitorHash = makeVisitorHash(ip + '|' + ua, 'view');

  // 找到最近一次同 visitor+path 的记录，累加 read_duration_ms
  const last = db
    .select({ id: schema.pageViews.id })
    .from(schema.pageViews)
    .where(
      and(
        eq(schema.pageViews.visitorHash, visitorHash),
        eq(schema.pageViews.path, body.path)
      )
    )
    .orderBy(sql`created_at desc`)
    .limit(1)
    .get();

  if (last) {
    db.update(schema.pageViews)
      .set({ readDurationMs: body.duration_ms })
      .where(eq(schema.pageViews.id, last.id))
      .run();
  }
  return c.json({ ok: true, data: { updated: !!last } });
});