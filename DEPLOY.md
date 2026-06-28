# 🚀 MyBlog — 一键部署

> MyBlog 2.0 部署文档。前端静态文件 + Hono API + SQLite + 可选 SMTP。

---

## 0. 部署前清单

| 项目 | 要求 | 说明 |
| :--- | :--- | :--- |
| Node.js | ≥ 20.x | 含 `Intl.Segmenter`（搜索/对话分词依赖） |
| 磁盘 | ≥ 2 GB | SQLite + 上传 + 构建产物 |
| 内存 | ≥ 1 GB | API 常驻 50-100 MB；前端无运行时 |
| 反代 | Nginx ≥ 1.20 或 Caddy | 用于 HTTPS + SSE 长连接 |

---

## 1. 方案 A：Docker Compose（推荐）

### 1.1 准备密钥

```bash
cp apps/api/.env.example .env
# 编辑 .env，按需设置以下变量
```

| 变量 | 必填 | 说明 |
| :--- | :--- | :--- |
| `AI_API_KEY` | ✅ | 必填，用于 AI 草稿/摘要接口；轮换即吊销旧客户端 |
| `ADMIN_USERNAME` | ✅ | 首个管理员用户名（仅在 users 表为空时生效） |
| `ADMIN_PASSWORD` | ✅ | 首个管理员密码（≥ 8 位） |
| `CORS_ORIGINS` | ✅ | 逗号分隔，例如 `https://blog.example.com,https://admin.example.com` |
| `RATE_LIMIT_WRITES_PER_MINUTE` | ⬜ | 写接口每 IP 限流，默认 30 |

> ⚠️ **SMTP（PRD §2.3.1）**：2.0 的 Newsletter 双确认邮件目前**默认未启用**（未配 SMTP 时 API 直接在响应里返回 confirm_url）。如需启用，在 `.env` 加：
>
> ```bash
> SMTP_HOST=smtp.example.com
> SMTP_PORT=587
> SMTP_USER=hello@example.com
> SMTP_PASS=xxx
> SMTP_FROM="MyBlog <hello@example.com>"
> ```

### 1.2 构建

```bash
npm install
npm run build:shared   # 先构建 shared 类型包
npm run build:api      # 编译 API TypeScript
npm run build:web      # 输出到 apps/web/dist（nginx 提供）
npm run build:admin    # 输出到 apps/admin/dist（部署在 /admin 路径）
```

### 1.3 启动

```bash
docker-compose up -d
```

服务地址：

| 服务 | 地址 |
| :--- | :--- |
| 公开站点 | http://localhost |
| 管理后台 | http://localhost/admin |
| API | http://localhost/api（通过 nginx 反代） |
| 健康检查 | http://localhost/api/health（= `/health`） |

### 1.4 HTTPS

将 `cert.pem` + `key.pem` 放入 `./certs/`，追加 server 块到 `nginx.conf`：

```nginx
server {
  listen 443 ssl http2;
  ssl_certificate     /etc/nginx/certs/cert.pem;
  ssl_certificate_key /etc/nginx/certs/key.pem;
  # 复用 80 端口的 location 块
}
```

---

## 2. 方案 B：单机 PM2 + nginx

```bash
# 1. 构建
npm install
npm run build:shared
npm run build:api
npm run build:web
npm run build:admin

# 2. PM2 启动 API（ecosystem.config.cjs 在 apps/api）
cd apps/api
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # 开机自启

# 3. 配置 nginx
sudo cp ../nginx.conf /etc/nginx/conf.d/myblog.conf
sudo cp -r ../apps/web/dist /var/www/myblog/web
sudo cp -r ../apps/admin/dist /var/www/myblog/admin
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. 2.0 部署注意事项

### 3.1 SSE 长连接超时

站内 AI 对话（`POST /api/v1/chat/sessions/:id/messages`）是 SSE 流式输出。nginx 默认 `proxy_read_timeout 60s` 可能不够（一次响应会持续到答案写完），建议在 `nginx.conf` 的 `/api/` 块里：

```nginx
location /api/ {
  proxy_pass http://myblog_api;
  proxy_http_version 1.1;
  proxy_buffering off;          # 关键：关闭缓冲让 SSE 实时推送
  proxy_cache off;
  proxy_read_timeout 5m;        # 留足 5 分钟
  proxy_send_timeout 5m;
  # ... 其余 header
}
```

### 3.2 SQLite 单实例限制

SQLite 文件锁不支持多写。**只跑一个 API 容器 / PM2 实例**。水平扩展需切换 PostgreSQL（CLAUDE.md 禁止）。

### 3.3 WAL 模式与备份

`migrate.ts` 已开启 WAL。热备份（无需停服）：

```bash
sqlite3 data/myblog.db ".backup '/path/to/backup-$(date +%F).db'"
```

2.0 新增表也包含在 `myblog.db` 里：

```
users / sessions / subscribers          ← 用户体系
vibe_notes / comments / reactions       ← 互动数据
page_views                              ← 阅读量 + 来源追踪
chat_sessions / chat_messages           ← AI 对话存档（可定期清理）
ai_audit_logs                           ← AI 调用审计
```

### 3.4 登录失败锁定

`apps/api/src/middleware/session.ts` 内置 5 次失败 → 锁定 15 分钟。**计数在内存**，重启 API 会清零。多实例部署需引入 Redis 共享。

### 3.5 Newsletter（订阅）

- 未配 SMTP：confirm_url 在 API 响应里直接返回，**适合 dev**。生产请配 SMTP。
- 退订 token 是明文存库：定期清理 `status='unsubscribed'` 行可减小体积。

### 3.6 搜索索引重建

新内容发布后 FTS 触发器自动同步。如遇索引漂移：

```bash
# 管理后台 → 「搜索索引」 → 一键重建
# 或 curl：
curl -X POST -H "Cookie: myblog_session=..." http://localhost/api/v1/admin/search/rebuild
```

### 3.7 草稿乱码（PRD §7.3）

API 默认 UTF-8 编码。如部署到非 UTF-8 系统会导致乱码：

```bash
# 启动前
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

---

### 3.5 MCP 端点白名单（AI 代运营）

`/api/mcp/*` 用于本地 agent 远程调运营动作（草稿、评论、审核），鉴权用 `X-AI-API-Key` 头（不是 session）。**默认建议加 IP 白名单**，只让 agent 所在网络访问：

```nginx
# 在 /api/ 块里加 location 优先匹配
location /api/mcp/ {
  # allow 1.2.3.4;   # 你的 agent 出口 IP
  # deny all;
  proxy_pass http://myblog_api;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_read_timeout 30s;
}
```

agent 端环境变量：

```bash
BLOG_API_BASE_URL=https://blog.your-domain.com   # 部署后必改
BLOG_AI_API_KEY=<server-side AI_API_KEY 的值>
```

MCP server 本地启动（stdio transport）：

```bash
cd mcp/blog-operator
npm install
BLOG_API_BASE_URL=... BLOG_AI_API_KEY=... npx tsx src/index.ts
```

接入 Claude Desktop / Cursor 等 MCP host，配置示例见 `mcp/blog-operator/README.md`。

---

## 4. 健康检查 & 监控

```bash
# 进程存活
curl http://localhost/api/health
# { "ok": true, "data": { "uptime": 12345.6 } }

# 数据完整性
curl -b cookies.txt http://localhost/api/v1/admin/analytics
# stats.todayPV / stats.totalPosts 应该 > 0
```

推荐监控指标：

- `/health` 返回 200
- API 进程内存 < 200 MB
- `data/myblog.db-wal` 大小 < 50 MB（过大说明 checkpoint 没跑）

---

## 5. 故障排查

| 现象 | 排查 |
| :--- | :--- |
| API 起不来报 `EADDRINUSE` | `netstat -ano \| findstr :8787` 找占用 PID 杀掉 |
| 前端 404 / 静态资源没找到 | 没跑 `npm run build:web`，nginx 找不到 dist |
| 管理后台 401 | `ADMIN_PASSWORD` 与登录页提示不一致；或重启后未重建 session |
| SSE 卡死 | nginx 没关 `proxy_buffering` |
| Newsletter 收不到邮件 | 没配 `SMTP_HOST`，dev 模式直接看 API 响应的 confirm_url |
| 搜索没结果 | 「搜索索引」Tab 手动重建；或 post 状态不是 `published` |
| 草稿乱码 | 系统 LANG 不是 UTF-8（见 §3.7） |

---

## 6. 升级步骤

```bash
git pull
npm install
npm run build:shared && npm run build:api && npm run build:web && npm run build:admin
# 数据库迁移会自动跑（API 启动时执行 migrate()）
pm2 restart myblog-api
# 或
docker-compose up -d --build
```

迁移是**幂等**的：表已存在会跳过，新增表/列会自动建。FTS 重建建议在升级后手动跑一次。

---

## 7. 备份策略

```bash
# 每日备份脚本示例（crontab）
0 3 * * * sqlite3 /opt/myblog/data/myblog.db ".backup '/backup/myblog-$(date +\%F).db'"
# 保留 30 天
0 4 * * * find /backup -name 'myblog-*.db' -mtime +30 -delete
```

同时备份 `uploads/` 目录（用户上传）。

---

## 8. 资源占用参考

| 服务 | CPU | 内存 | 磁盘 |
| :--- | :--- | :--- | :--- |
| 前端（Nginx 静态） | < 1% | < 50 MB | 构建 ~30 MB × 2 |
| API（Node） | < 5% | 50–100 MB | DB 增长约 1 MB/千次 PV |
| SQLite | — | 与 API 共享 | 含 -wal -shm 三件套 |

可轻松运行在 2 核 CPU / 2 GB 内存的服务器上。