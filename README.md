# MyBlog

> 视觉体验优先、AI 原生内容管理的个人技术博客。

Astro 5 + React Islands 前端，Hono + SQLite (Drizzle) 后端，单文件部署。集成长文 / 项目 / Vibe 笔记、全文搜索、AI 对话、评论互动、数据分析与 MCP 内容运营。

![tech](https://img.shields.io/badge/Astro-5-BC52EE) ![tech](https://img.shields.io/badge/React-19-61DAFB) ![tech](https://img.shields.io/badge/Hono-4-E36002) ![tech](https://img.shields.io/badge/SQLite-3-003B57) ![tech](https://img.shields.io/badge/TypeScript-5-3178C6)

## ✨ 功能

### 内容

- **长文 / 项目 / Vibe 笔记** — 支持 Mermaid、KaTeX、`:::tip / warning / danger / info` 容器
- **Vibe 笔记** — 1–500 字短笔记，mood 标签，按月时间线，与长文解耦
- **自动封面 / 摘要 / 阅读时长 / 自动标签** — 离线 AI 关键点抽取，CJK 400 字 / EN 250 词 每分钟
- **全文搜索** — SQLite FTS5 + 中文分词（Intl.Segmenter），`/search` 页面 + `Cmd/Ctrl+K` 命令面板

### 互动

- **评论** — 嵌套 2 层，登录用户免审，首次评论待审，敏感词自动 pending
- **点赞** — 文章 / Vibe / 评论均可，乐观 UI + 游客 hash 去重
- **Newsletter** — 双确认邮件 + 一键退订 token；未配 SMTP 时降级为收集模式

### AI

- **站内对话** (`/chat`) — 基于站内内容的检索式 AI，SSE 流式，浮动窗 + 全屏页
- **LLM Tool Calling** — 模型可自主调用 `search_blog` 工具检索 FTS5 索引，grounded 引用
- **MCP 内容运营** — 11 个工具暴露给 Claude Desktop / Cursor / 自定义 agent，从 GitHub / 大纲 / 关键词生成草稿
- **自动摘要 + 标签** — bigram 匹配 + 既有标签库复用

### 数据

- **阅读量追踪** — Beacon 上报 + 30s 去重 + bot 过滤
- **来源追踪** — referer host 归一化 + UTM source
- **SVG 仪表盘** — 30 天 PV、来源分布、热门标签云、评论活跃度

### 权限与管理

- **多角色** — `admin / editor / author / reader`，session cookie + 滑动续期
- **安全** — scrypt 密码哈希、5 次登录失败锁定 15 分钟、HttpOnly cookie
- **管理后台** — 11 个 Tab：仪表盘 / 文章 / 项目 / Vibe / 评论 / 用户 / 订阅者 / 数据 / AI 控制台 / 搜索索引 / 站点设置
- **订阅者 CSV 导出** — 含 BOM 防 Excel 乱码

### 体验

- **视觉优先** — Astro 5 + React Islands，Framer Motion + View Transitions API
- **暗 / 亮主题** — CSS 变量驱动，平滑切换
- **磁性光标 + 打字机 Hero** — 移动端禁用
- **品牌加载动画 + 滚动进度条**

## 🏗 技术栈

| 层级 | 选型 |
| :--- | :--- |
| 前端 | Astro 5 + React Islands |
| 动效 | Framer Motion + View Transitions API |
| 样式 | Tailwind 3 + CSS Variables |
| 后端 | Hono (Node.js) |
| 数据库 | SQLite（WAL 模式） |
| ORM | Drizzle |
| 鉴权 | Session-based cookie（scrypt） |
| 搜索 | SQLite FTS5 + Intl.Segmenter |
| 部署 | Docker Compose / PM2 + Nginx |

## 📁 目录结构

```
myblog/
├── apps/
│   ├── web/        # 公开博客（Astro + React Islands）   → :4321
│   ├── admin/      # 管理后台（Astro + React）           → :4322
│   └── api/        # REST API（Hono + Drizzle + SQLite） → :8787
├── packages/
│   └── shared/     # 共享 TypeScript 类型
├── data/           # SQLite 数据库 + 上传文件
├── docs/           # 架构说明 / API 契约 / 部署指南
├── scripts/        # seed / 迁移 / 截图验证
├── nginx.conf
├── docker-compose.yml
└── CLAUDE.md       # 给 AI 助手的项目级操作指南
```

子应用说明：[apps/api/README.md](apps/api/README.md) · [apps/web/README.md](apps/web/README.md) · [apps/admin/README.md](apps/admin/README.md)

## 🚀 快速开始

### 前置要求

- Node.js ≥ 20（`Intl.Segmenter` 用于搜索分词）
- npm ≥ 9

### 安装与启动

```bash
npm install
npm run db:migrate     # 建表（幂等）
npm run db:seed        # 种子数据（幂等）
npm run dev            # 同时启动 api + web + admin
```

服务地址：

| 服务 | 地址 | 默认凭据 |
| :--- | :--- | :--- |
| 公开站点 | http://localhost:4321 | — |
| 管理后台 | http://localhost:4322 | `admin` / `myblog2026` |
| API | http://localhost:8787 | AI 接口需 `X-AI-API-Key` |

### 单应用启动

```bash
npm run dev:api        # 仅 API（8787）
npm run dev:web        # 仅前端（4321）
npm run dev:admin      # 仅后台（4322）
```

## ⚙️ 环境配置

全局变量在仓库根目录 `.env`（模板见 `.env.example`）。加载顺序：**根 `.env` → `apps/<app>/.env`**（后者覆盖前者）。

| 变量 | 必填 | 用途 |
| :--- | :--- | :--- |
| `NODE_ENV` | ❌ | `development` / `production` |
| `API_PORT` | ❌ | API 监听端口（默认 8787；实际读取 `PORT`） |
| `DB_PATH` | ❌ | SQLite 文件路径（相对 `apps/api/`） |
| `AI_API_KEY` | ✅ | 站内 AI / MCP 鉴权 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | ✅ | 管理后台首次启动 seed |
| `CORS_ORIGINS` | ❌ | 逗号分隔允许的来源 |
| `RATE_LIMIT_WRITES_PER_MINUTE` | ❌ | 写接口限流 |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | ❌ | 真实 LLM（留空走 FTS5 模板降级） |
| **`AUTHOR_NAME`** | ✅ | 显示名，启动时灌入 `settings` 表 |
| **`AUTHOR_EMAIL`** | ✅ | 邮箱，前端"关于"页 + 订阅通知 |
| **`AUTHOR_GITHUB`** | ✅ | GitHub profile URL |

**作者信息同步机制**：后端启动时若 `AUTHOR_*` 已设置，会覆盖 `settings` 表中 `author_name` / `email` / `github_url`，前端通过 `GET /api/v1/settings/public` 读取。改根 `.env` → 重启 API 即可生效。

> 修改后**只需重启 API 服务**（web/admin 在 build 时已注入，构建一次后无需重启）。

## 📡 API 速览

响应统一格式：`{ ok: true, data }` 或 `{ ok: false, error }`

| 模块 | 端点 | 说明 |
| :--- | :--- | :--- |
| 文章 | `GET /api/v1/posts` | 列表 / 标签 / 详情 |
| Vibe | `GET /api/v1/vibe` | 时间线 + 详情 |
| 评论 | `POST /api/v1/comments` | 嵌套提交 |
| 点赞 | `POST /api/v1/reactions` | toggle（user / visitor_hash） |
| 追踪 | `POST /api/v1/track/view` | Beacon 阅读量 |
| 搜索 | `GET /api/v1/search?q=` | FTS5 + 分词 |
| 订阅 | `POST /api/v1/subscribers` | 双确认 |
| 对话 | `POST /api/v1/chat/sessions/:id/messages` | SSE 流式 |
| 管理 | `GET /api/v1/admin/*` | editor+ 守卫 |
| 鉴权 | `POST /api/v1/auth/{login,register,logout}` | scrypt + session |
| MCP | `POST /api/mcp/*` | `X-AI-API-Key` 守卫 |

完整契约见 [docs/mybog.md](docs/mybog.md)。

## 🗃 数据模型

13 张表 + 2 张 FTS5 虚拟表（drizzle schema 在 `apps/api/src/db/schema.ts`）：

```
users / sessions              — 多角色 + cookie session
posts / post_tags / tags      — 长文 + 标签多对多
post_versions                 — 编辑历史
vibe_notes                    — 短笔记（独立表）
comments                      — 嵌套评论（最多 2 层）
reactions                     — 通用点赞（post|vibe|comment）
page_views                    — 阅读量 + 来源追踪
subscribers                   — Newsletter 邮箱
chat_sessions / chat_messages — AI 对话存档
ai_audit_logs                 — AI 调用审计
settings                      — 站点设置 KV

posts_fts / vibe_fts          — FTS5 虚拟表（触发器自动同步）
```

## 🤖 MCP 内容运营

把博客运营动作以 [Model Context Protocol](https://modelcontextprotocol.io/) 工具形式暴露给外部 agent：

```
agent ─stdio→ MCP server ─HTTP(X-AI-API-Key)→ MyBlog /api/mcp/*
```

| 工具 | 用途 |
| :--- | :--- |
| `list_drafts` / `get_draft` | 拉草稿 |
| `create_draft_from_{github,outline,trending}` | 三种内容来源生成 |
| `review_draft` | 审核：publish / reject / request_revision |
| `list_recent_posts` / `update_post` | 读写文章 |
| `list_pending_comments` / `moderate_comment` | 审核评论 |
| `get_analytics_summary` | 核心指标 |

部署：`BLOG_API_BASE_URL=https://blog.your-domain.com` + `BLOG_AI_API_KEY=<AI_API_KEY>`。

## 🎨 设计语言

| 元素 | 规范 |
| :--- | :--- |
| 主色 | `#7c3aed`（紫） |
| 辅色 | 粉（accent-2）、蓝（accent-3） |
| 字体 | Display: italic serif（Fraunces）；Body: Noto Sans SC |
| 圆角 | 12px |
| 动效 | framer-motion spring + view transitions |
| 光标 | 磁性圆环 + 圆点（移动端禁用） |
| 主题 | dark / light 切换，CSS 变量驱动 |

### 移动端

- **不独立版本** — 只调参，不动结构
- 适配视口：320 / 375 / 414 / 768
- 字号：`clamp(min, vw, max)` 流体
- `100dvh` + `env(safe-area-inset-*)` 适配 iOS

## 📦 部署

详见 [DEPLOY.md](DEPLOY.md)。两种方案：

- **Docker Compose**（推荐）— 一键启动 API + Nginx
- **PM2 + Nginx** — 单机部署

`.env` 配置：

```bash
AI_API_KEY=<强随机串>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<强密码>
CORS_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com

# 可选 SMTP
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=...
# SMTP_PASS=...
# SMTP_FROM="MyBlog <hello@example.com>"
```

## 📜 License

Private · 个人项目 · 2026