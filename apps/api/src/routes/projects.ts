/**
 * 项目路由 — 公共列表 + 管理端 CRUD。
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { rowToProject } from '../utils/sensitive.js';
import { requireRole } from '../middleware/session.js';

export const projectsRouter = new Hono();

// 公共列表
projectsRouter.get('/', async (c) => {
  const db = getDb();
  const status = c.req.query('status');
  const tech = c.req.query('tech');

  const conditions: any[] = [];
  if (status) conditions.push(eq(schema.projects.status, status as any));

  const rows = db
    .select()
    .from(schema.projects)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(asc(schema.projects.sortOrder))
    .all();

  let filtered = rows;
  if (tech) {
    filtered = rows.filter((r) => {
      try {
        return (JSON.parse(r.techStack) as string[]).includes(tech);
      } catch {
        return false;
      }
    });
  }

  return c.json({ ok: true, data: filtered.map(rowToProject) });
});

projectsRouter.get('/:id', async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  const row = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  if (!row) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true, data: rowToProject(row) });
});

// 管理端
projectsRouter.post(
  '/',
  requireRole('editor'),
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      tech_stack: z.array(z.string()).optional(),
      github_url: z.string().optional(),
      demo_url: z.string().optional(),
      status: z.enum(['active', 'archived', 'planned']).optional(),
      sort_order: z.number().optional(),
    })
  ),
  async (c) => {
    const db = getDb();
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const inserted = db
      .insert(schema.projects)
      .values({
        name: body.name,
        description: body.description,
        techStack: JSON.stringify(body.tech_stack ?? []),
        githubUrl: body.github_url,
        demoUrl: body.demo_url,
        status: body.status ?? 'active',
        sortOrder: body.sort_order ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json({ ok: true, data: rowToProject(inserted) }, 201);
  }
);

projectsRouter.patch(
  '/:id',
  requireRole('editor'),
  zValidator(
    'json',
    z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      tech_stack: z.array(z.string()).optional(),
      github_url: z.string().optional(),
      demo_url: z.string().optional(),
      full_project_url: z.string().optional(),
      changelog: z.string().optional(),
      screenshots: z.array(z.string()).optional(),
      status: z.enum(['active', 'archived', 'planned']).optional(),
      sort_order: z.number().optional(),
    })
  ),
  async (c) => {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const body = c.req.valid('json');
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.tech_stack !== undefined) updates.techStack = JSON.stringify(body.tech_stack);
    if (body.github_url !== undefined) updates.githubUrl = body.github_url;
    if (body.demo_url !== undefined) updates.demoUrl = body.demo_url;
    if (body.full_project_url !== undefined) updates.fullProjectUrl = body.full_project_url;
    if (body.changelog !== undefined) updates.changelog = body.changelog;
    if (body.screenshots !== undefined) updates.screenshots = JSON.stringify(body.screenshots);
    if (body.status !== undefined) updates.status = body.status;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;

    db.update(schema.projects).set(updates).where(eq(schema.projects.id, id)).run();
    const updated = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    if (!updated) return c.json({ ok: false, error: 'Not found' }, 404);
    return c.json({ ok: true, data: rowToProject(updated) });
  }
);

projectsRouter.delete('/:id', requireRole('editor'), async (c) => {
  const db = getDb();
  const id = Number(c.req.param('id'));
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

// 未来 GitHub 同步的占位接口
projectsRouter.post('/sync-github', requireRole('editor'), async (c) => {
  return c.json({
    ok: true,
    data: { synced: 0, message: 'GitHub sync will be enabled in a future version' },
  });
});
