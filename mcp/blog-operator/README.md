# MyBlog Operator MCP

MCP server，把 MyBlog 的运营动作（草稿、评论、分析）以工具形式暴露给外部 AI agent。

## 工具清单（11 个）

| 工具 | 用途 |
|:--|:--|
| `list_drafts` | 拉待审草稿（按 status / source_type 过滤） |
| `get_draft` | 读单篇草稿（含 source_meta 解析） |
| `create_draft_from_github` | 基于 GitHub ref 生成草稿 |
| `create_draft_from_outline` | 大纲扩写 |
| `create_draft_from_trending` | 关键词热点综述 |
| `review_draft` | 审核（publish / reject / request_revision） |
| `list_recent_posts` | 列已发布 / 草稿 |
| `update_post` | 改文章（content 变更落版本历史） |
| `list_pending_comments` | 列待审评论 |
| `moderate_comment` | 评论审核 |
| `get_analytics_summary` | 拉核心运营指标 |

## 配置（环境变量，**不在代码里硬编码 URL**）

| 变量 | 必填 | 说明 |
|:--|:--|:--|
| `BLOG_API_BASE_URL` | ✅ | MyBlog API base。开发: `http://localhost:8787`；部署: `https://blog.your-domain.com` |
| `BLOG_AI_API_KEY` | ✅ | 对应服务端 `AI_API_KEY` 的值（`X-AI-API-Key` header） |
| `BLOG_API_TIMEOUT_MS` | ❌ | 默认 30000 |

## 启动

```bash
# 安装
npm install

# 开发态（tsx 直接跑）
BLOG_API_BASE_URL=http://localhost:8787 \
BLOG_AI_API_KEY=dev-ai-key-change-me-in-production-12345 \
npx tsx src/index.ts

# 生产：先 build
npm run build
node dist/index.js
```

## 接入 Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "myblog-operator": {
      "command": "npx",
      "args": ["-y", "@myblog/blog-operator-mcp"],
      "env": {
        "BLOG_API_BASE_URL": "https://blog.your-domain.com",
        "BLOG_AI_API_KEY": "<your-server-ai-api-key>"
      }
    }
  }
}
```

## 部署到服务器

部署后 `BLOG_API_BASE_URL` 改成线上域名即可，**MCP 代码零改动**。

服务端 nginx 建议给 `/api/mcp/*` 加 IP 白名单，只允许 agent 所在网络访问：

```nginx
location /api/mcp/ {
    # allow 1.2.3.4;   # 你的 agent IP
    # deny all;
    proxy_pass http://127.0.0.1:8787;
}
```

## 通信协议

- **stdio transport**（默认）—— Claude Desktop / Cursor 走这个
- HTTP / SSE transport 可扩展，参考 `@modelcontextprotocol/sdk` 的 `SSEServerTransport`

## 与后端的关系

MCP server 不实现任何业务逻辑，所有动作都是 HTTP 转发到 MyBlog API 的 `/api/mcp/*` 端点：

```
agent ─stdio→ MCP server ─HTTP(X-AI-API-Key)→ MyBlog API /api/mcp/*
```

后端鉴权独立于 admin session，agent 拿一把 `AI_API_KEY` 就能工作，**不需要 admin 账号**。

## 典型 agent 工作流

1. `get_analytics_summary()` — 拉指标看博客现状
2. `list_drafts(status='draft')` — 拉待审草稿
3. `get_draft(id)` — 逐篇读详情
4. `review_draft(id, action='publish' | 'reject', feedback?)` — 批量审核
5. `create_draft_from_outline(...)` — 新内容创作
6. `list_pending_comments()` + `moderate_comment(...)` — 清理评论
7. `get_analytics_summary()` — 再看一次，看本次操作影响
