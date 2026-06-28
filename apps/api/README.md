# @myblog/api

Hono + Drizzle ORM + SQLite (WAL) 后端。承载 2.0 全部业务逻辑：内容、互动、鉴权、AI、搜索、对话。

## 启动

```bash
# 从 monorepo 根目录
npm run dev:api          # 推荐（用 npm-run-all 同时启动其他服务）
# 或单独
npm --workspace apps/api run dev
```

监听 `http://localhost:8787`。启动时自动 `migrate()` + `seed()`（仅首次）。

## 配置

`apps/api/.env`（参考 `.env.example`）：

```bash
NODE_ENV=development
PORT=8787
DB_PATH=../../data/myblog.db
AI_API_KEY=dev-ai-key-change-me-in-production-12345
ADMIN_USERNAME=admin
ADMIN_PASSWORD=myblog2026
CORS_ORIGINS=http://localhost:4321,http://localhost:4322
RATE_LIMIT_WRITES_PER_MINUTE=30
```

可选 SMTP：`SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM`。

## 目录

```
src/
├── index.ts             # 入口：挂中间件 + 路由 + 启动 serve()
├── db/
│   ├── schema.ts        # Drizzle schema（11 张表 + 2 张 FTS5 虚拟表）
│   ├── migrate.ts       # 幂等迁移（启动时自动跑）
│   ├── seed.ts          # 种子数据（管理员账号 + 演示文章）
│   └── index.ts         # getDb() 单例
├── middleware/
│   ├── auth.ts          # aiAuth / adminAuth（X-Admin-* 头守卫）
│   ├── session.ts       # sessionMiddleware / requireAuth / requireRole
│   └── rate-limit.ts    # 内存版滑动窗口
├── routes/              # 13 个路由模块
│   ├── posts.ts         # 长文 CRUD + AI 生成
│   ├── vibe.ts          # 短笔记
│   ├── comments.ts      # 评论（嵌套 2 层）
│   ├── reactions.ts     # 通用点赞
│   ├── track.ts         # 阅读量 + 停留时长
│   ├── search.ts        # FTS5 + 分词
│   ├── subscribers.ts   # Newsletter 双确认
│   ├── chat.ts          # 站内对话 SSE
│   ├── analytics.ts     # 公开统计
│   ├── auth.ts          # 登录/注册/登出
│   ├── admin.ts         # 管理后台 CRUD（editor+ 守卫）
│   ├── projects.ts      # 项目展示
│   └── settings.ts      # 站点设置
├── services/
│   └── ai-content.ts    # AI 草稿生成
└── utils/
    ├── ai-enrich.ts     # 关键点 / 阅读时长 / 标签提取
    ├── crypto.ts        # scrypt + @oslojs/encoding token
    ├── reading.ts       # CJK/EN 阅读时长估算
    ├── sensitive-words.ts # 敏感词词表
    ├── sensitive.ts     # 行 → DTO 转换
    └── slug.ts          # slug 生成 + 去重
```

## 数据库

- 单文件 SQLite（`data/myblog.db`）
- WAL 模式 + `synchronous=NORMAL` + 64 MB 缓存
- 11 张业务表 + 2 张 FTS5 虚拟表（`posts_fts` / `vibe_fts`）+ AIUD 触发器
- 迁移**幂等**：用 `PRAGMA table_info` 探测后再 ALTER，避免重复

```bash
# 手动迁移 / 种子
npm run db:migrate
npm run db:seed
```

## API 契约

完整 OpenAPI 风格契约在 `docs/mybog.md`。所有响应统一格式：

```json
{ "ok": true, "data": ... }
{ "ok": false, "error": "..." }
```

`call()` 已在 `apps/admin/src/lib/admin-api.ts` 自动 unwrap 到 `data`。

### 鉴权

- AI 接口：`X-AI-API-Key: <AI_API_KEY>` 请求头
- 用户：`POST /api/v1/auth/login` 后 Set-Cookie `myblog_session`
- 角色守卫：`requireAuth / requireRole('editor'|'admin')`

### SSE

`POST /api/v1/chat/sessions/:id/messages` 是 SSE 流式响应。客户端用 `EventSource` 或 `fetch` + reader 解析 `event: / data: ` 帧。nginx 需关 `proxy_buffering`。

## 调试

```bash
# 健康检查
curl http://localhost:8787/health

# 列文章
curl http://localhost:8787/api/v1/posts | head

# 用 sqlite3 直接看库
sqlite3 data/myblog.db "SELECT id, title, status FROM posts LIMIT 5;"
```

## 测试 / Typecheck

```bash
npx tsc --noEmit        # 编译期类型检查
```

## 资源占用

常驻 50-100 MB；`data/myblog.db` 约 1 MB / 千次 PV。SQLite 不支持多写实例，**只跑一个 API 进程**。