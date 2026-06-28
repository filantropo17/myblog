# @myblog/admin

管理后台 — Astro 5 + React + Tailwind + framer-motion。

## 启动

```bash
# 从 monorepo 根
npm run dev:admin
# 或
npm --workspace apps/admin run dev
```

监听 `http://localhost:4322`。生产构建 `npm --workspace apps/admin run build` → `dist/`，部署在 `/admin` 路径。

## 演示账号

```
admin / myblog2026
```

## 鉴权

走 session cookie，**不是** X-Admin headers。`apps/admin/src/lib/admin-api.ts` 全部用 `credentials: 'include'`：

```ts
fetch(`${API_BASE}/api/v1/admin/xxx`, {
  credentials: 'include',  // 带上 myblog_session
});
```

`requireRole('editor')` 守卫覆盖 `/api/v1/admin/*` 全部接口。`editor` 及以上可访问：

- 仪表盘 / 草稿 / 文章 / 项目 / AI 控制台
- Vibe 笔记
- 评论审核
- 用户管理（仅 admin 可写）
- 订阅者（含 CSV 导出）
- 数据分析（SVG 仪表盘）
- 搜索索引（仅 admin）

## 目录

```
src/
├── components/
│   ├── AdminApp.tsx       # 主壳（登录 + tab 路由 + 主题切换）
│   ├── Dashboard.tsx
│   ├── PostManager.tsx
│   ├── PostEditor.tsx
│   ├── MarkdownEditor.tsx
│   ├── ProjectManager.tsx
│   ├── AiConsole.tsx
│   ├── ThemeToggle.tsx
│   ├── VibeManager.tsx
│   ├── VibeEditor.tsx
│   ├── CommentModerator.tsx
│   ├── UserManager.tsx
│   ├── SubscriberManager.tsx  # CSV 导出
│   ├── AnalyticsDashboard.tsx # SVG 折线 + 来源 + 标签云 + 评论活跃度
│   └── SearchIndexAdmin.tsx
├── lib/
│   └── admin-api.ts    # 类型化 API 客户端（cookie auth）
├── pages/
│   └── index.astro     # 单页 SPA，react 接管
└── styles/
    └── global.css      # admin 暗色调（CSS 变量驱动）
```

## 关键交互

- **新建草稿** — Dashboard / AI 控制台 → 调 `generateFromOutline` / `generateFromTrending`
- **发布流程** — 草稿 → 审阅 → 发布 / 打回 / 修订
- **评论审核** — `pending / approved / spam / rejected` 四态切换
- **CSV 导出** — 订阅者 tab 右上角「导出 CSV」（含 BOM 防 Excel 乱码）
- **FTS 重建** — 搜索索引 tab 一键清空 + 重新填充

## Typecheck

```bash
npx astro check
```

## 构建

```bash
npm --workspace apps/admin run build
# 产物：dist/
# nginx 部署示例：
#   location /admin {
#     alias /usr/share/nginx/admin;
#     try_files $uri $uri/ /admin/index.html;
#   }
```