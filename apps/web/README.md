# @myblog/web

公开站点 — Astro 5 + React Islands + Tailwind 3 + Framer Motion。

## 启动

```bash
# 从 monorepo 根
npm run dev:web
# 或
npm --workspace apps/web run dev
```

监听 `http://localhost:4321`。生产构建 `npm --workspace apps/web run build` → `dist/`（nginx 静态托管）。

## 设计语言

| 元素 | 规范 |
| :--- | :--- |
| 主色 | `--accent: #7c3aed`（紫） |
| 辅色 | `--accent-2`（粉）`--accent-3`（蓝） |
| 字体 | Display: italic serif（Fraunces）；Body: Noto Sans SC |
| 圆角 | 12px（在 settings 里可改） |
| 动效 | framer-motion spring + View Transitions API |
| 光标 | 磁性圆环 + 圆点（移动端禁用） |
| 主题 | dark / light 切换，CSS 变量驱动 |

## 移动端

- 不独立版本：只调参，不动结构
- 适配视口：320 / 375 / 414 / 768
- 字号：`clamp(min, vw, max)` 流体
- 桌面用 `md:` 前缀覆盖
- `100dvh` + `env(safe-area-inset-*)` 适配 iOS

## 目录

```
src/
├── components/         # 复用组件
│   ├── Header.astro    # 顶部导航（5 tabs：首页/文章/Vibe/项目/关于）
│   ├── Footer.astro    # 底部 + SubscribeForm
│   ├── CommandPalette.tsx  # Cmd/Ctrl+K 全局搜索
│   ├── ChatWidget.tsx      # 浮动 AI 对话
│   ├── ChatFullscreen.tsx  # /chat 全屏对话
│   ├── CommentSection.tsx  # 评论（嵌套 + Markdown）
│   ├── LikeButton.tsx      # 乐观 UI 点赞
│   ├── ViewBeacon.tsx      # 阅读量 Beacon
│   ├── SubscribeForm.tsx   # Newsletter 订阅表单
│   └── ThemeProvider.tsx   # 主题 + 光标 + 滚动进度 + 加载动画
├── layouts/
│   └── Layout.astro    # 全站壳：Header + Footer + 交互组件
├── pages/
│   ├── index.astro
│   ├── search.astro    # FTS5 搜索结果页（含侧边栏筛选）
│   ├── chat.astro      # AI 对话全屏页
│   ├── about.astro
│   ├── 404.astro
│   ├── posts/
│   │   ├── index.astro
│   │   └── [slug].astro
│   ├── projects/
│   │   ├── index.astro
│   │   └── [slug].astro
│   └── vibe/
│       ├── index.astro    # 时间线 + mood
│       └── [id].astro     # 大字号单条
└── styles/
    └── global.css      # CSS 变量 + 全局基础样式
```

## 关键功能

- **搜索页 `/search`** — 侧边栏按 tag / category / type / 时间筛选，结果用 `<mark>` 高亮
- **Vibe 时间线 `/vibe`** — 按月分组，置顶条置顶，mood emoji 显示
- **聊天按钮** — 右下角浮窗（移动端占满），`/chat` 全屏页带历史会话列表
- **评论** — 嵌套 2 层、登录用户免审 badge、Markdown 轻渲染
- **订阅** — Footer 的 email 表单 → 双确认（dev 模式直接展示链接）

## API 客户端

`PUBLIC_API_BASE` 在 `.env`：

```bash
PUBLIC_API_BASE=http://localhost:8787
```

读取统一通过 `import.meta.env.PUBLIC_API_BASE`，组件内 fallback 到 `http://localhost:8787`。

## Typecheck

```bash
npx astro check
```

## 构建产物

`dist/`：

- `index.html` `/posts/` `/vibe/` 等静态 HTML
- `_astro/` — JS / CSS chunk（按路由分包）
- `assets/` — 图片

nginx 只需把 `dist/` 挂到 `/usr/share/nginx/html` 即可。