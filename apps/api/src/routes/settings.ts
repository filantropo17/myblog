/**
 * 设置（站点配置）路由。
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { adminAuth, adminLogin } from '../middleware/auth.js';

export const settingsRouter = new Hono();

// 公共站点配置 — 为前端提供最小化的字段
settingsRouter.get('/public', async (c) => {
  const db = getDb();
  const rows = db.select().from(schema.settings).all();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  let skills: string[] = [];
  try {
    skills = JSON.parse(map.author_skills ?? '[]');
  } catch {
    skills = [];
  }

  return c.json({
    ok: true,
    data: {
      title: map.site_title ?? 'MyBlog',
      tagline: map.site_tagline ?? '',
      description: map.site_description ?? '',
      author: {
        name: map.author_name ?? 'Anonymous',
        avatar: map.author_avatar ?? '',
        bio: map.author_bio ?? '',
        skills,
        socials: {
          github: map.github_url,
          twitter: map.twitter_url,
          email: map.email,
        },
      },
      theme: {
        accent: map.theme_accent ?? '#7c3aed',
        radius: map.theme_radius ?? '12px',
      },
    },
  });
});

// 管理端：获取所有设置
settingsRouter.get('/admin/all', adminAuth, async (c) => {
  const db = getDb();
  const rows = db.select().from(schema.settings).all();
  return c.json({ ok: true, data: rows });
});

// 管理端：更新
settingsRouter.put(
  '/admin/update',
  adminAuth,
  zValidator('json', z.object({ key: z.string(), value: z.string() })),
  async (c) => {
    const db = getDb();
    const { key, value } = c.req.valid('json');
    const now = new Date().toISOString();

    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (existing) {
      db.update(schema.settings)
        .set({ value, updatedAt: now })
        .where(eq(schema.settings.key, key))
        .run();
    } else {
      db.insert(schema.settings).values({ key, value, updatedAt: now }).run();
    }
    return c.json({ ok: true, data: { key, value } });
  }
);

// 管理端登录
settingsRouter.post(
  '/admin/login',
  zValidator('json', z.object({ username: z.string(), password: z.string() })),
  async (c) => {
    const { username, password } = c.req.valid('json');
    const result = adminLogin(username, password);
    if (!result) return c.json({ ok: false, error: 'Invalid credentials' }, 401);
    return c.json({ ok: true, data: result });
  }
);
