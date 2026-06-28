/**
 * MyBlog API — Hono 入口。
 */
import './utils/env.js'; // 必须第一行：基于文件位置加载 .env
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { postsRouter } from './routes/posts.js';
import { projectsRouter } from './routes/projects.js';
import { analyticsRouter } from './routes/analytics.js';
import { settingsRouter } from './routes/settings.js';
import { authRouter } from './routes/auth.js';
import { vibeRouter } from './routes/vibe.js';
import { commentsRouter } from './routes/comments.js';
import { reactionsRouter } from './routes/reactions.js';
import { trackRouter } from './routes/track.js';
import { searchRouter } from './routes/search.js';
import { adminRouter } from './routes/admin.js';
import { mcpRouter } from './routes/mcp.js';
import { subscribersRouter } from './routes/subscribers.js';
import { chatRouter } from './routes/chat.js';
import { llmConfigRouter } from './routes/admin-llm.js';
import { sessionMiddleware } from './middleware/session.js';

// 启动时自动迁移 + 种子数据，让开发体验零配置
migrate();
seed();

const app = new Hono();

app.use('*', logger());
app.use('*', sessionMiddleware); //：全局注入 c.set('user')
app.use(
  '*',
  cors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:4321,http://localhost:4322').split(','),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'X-AI-API-Key',
      'X-Admin-User',
      'X-Admin-Pass',
      'X-Admin-Session',
    ],
    exposeHeaders: ['Set-Cookie'],
  })
);

app.get('/', (c) =>
  c.json({
    ok: true,
    data: {
      name: 'MyBlog API',
      version: '1.0.0',
      endpoints: [
        'GET    /health',
        'GET    /api/v1/posts',
        'GET    /api/v1/posts/:slug',
        'GET    /api/v1/posts/tags',
        'GET    /api/v1/projects',
        'GET    /api/v1/projects/:id',
        'GET    /api/v1/settings/public',
        'GET    /api/v1/analytics/ai-context',
        'GET    /api/v1/analytics/stats',
        'POST   /api/v1/posts           (AI)',
        'POST   /api/v1/posts/from-github  (AI)',
        'POST   /api/v1/posts/from-outline (AI)',
        'POST   /api/v1/posts/from-trending (AI)',
        'PATCH  /api/v1/posts/:id/review  (admin)',
        'GET    /api/v1/posts/admin/all   (admin)',
        'PATCH  /api/v1/posts/admin/:id   (admin)',
        'POST   /api/v1/projects          (admin)',
        'PATCH  /api/v1/projects/:id      (admin)',
      ],
    },
  })
);

app.get('/health', (c) => c.json({ ok: true, data: { uptime: process.uptime() } }));

app.route('/api/v1/posts', postsRouter);
app.route('/api/v1/projects', projectsRouter);
app.route('/api/v1/analytics', analyticsRouter);
app.route('/api/v1/settings', settingsRouter);
app.route('/api/v1/auth', authRouter);
app.route('/api/v1/vibe', vibeRouter);
app.route('/api/v1/comments', commentsRouter);
app.route('/api/v1/reactions', reactionsRouter);
app.route('/api/v1/track', trackRouter);
app.route('/api/v1/search', searchRouter);
app.route('/api/v1/subscribers', subscribersRouter);
app.route('/api/v1/chat', chatRouter);
app.route('/api/v1/admin', adminRouter);
app.route('/api/v1/admin', llmConfigRouter);
app.route('/api/mcp', mcpRouter);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 MyBlog API listening on http://localhost:${info.port}`);
});
