# MyBlog · 项目级 Claude 指令

> 本文件是给 Claude Code / 后续 AI 助手的**项目操作指南**。阅读后应能快速理解项目结构、约束与历史问题。

---

## 0. 项目一句话

**MyBlog** —— 个人技术博客，Astro 5 + Hono + SQLite + Drizzle + React Islands，**视觉体验优先**（极光、紫黑配色、磁吸光标、打字机 Hero、View Transitions）。

PRD：
- `docs/prd-1.0.md` —— 第一阶段（已实现：首页/文章/项目/关于 + AI 代运营）
- `docs/prd-2.0.md` —— 第二阶段（规划中：Vibe 笔记/评论/搜索/多用户/AI 扩展）

**第二阶段实施前必读 `docs/prd-2.0.md`**。所有架构变更需同步更新 PRD。

---

## 1. 技术栈

| 层级 | 选型 | 备注 |
| :--- | :--- | :--- |
| 前端框架 | Astro 5 + React Islands | 默认静态输出，交互组件按需注水 |
| 动效 | Framer Motion + View Transitions API | 页面级转场 + 滚动驱动 |
| 样式 | Tailwind 3 + CSS Variables | 主题切换用 `[data-theme]` + CSS 变量 |
| 后端 | Hono (Node.js) | 轻量 Web 框架 |
| 数据库 | SQLite (WAL Mode) | 单文件，零进程 |
| ORM | Drizzle | 类型安全 |
| 鉴权 | Session-based cookie（2.0 规划） | 1.0 仅 AI API Key |
| 部署 | PM2 + Nginx（规划） | 当前 dev 模式 |

**禁止使用的栈**：Next.js、PostgreSQL、外部数据库服务、Vue/Svelte（项目已锁定 React Islands）。

---

## 2. 目录结构

```
myblog/
├── apps/
│   ├── web/                    # Astro 前端
│   │   ├── src/
│   │   │   ├── components/     # 复用组件
│   │   │   ├── pages/          # 路由
│   │   │   ├── layouts/        # 布局
│   │   │   └── styles/         # global.css
│   │   └── astro.config.mjs
│   └── api/                    # Hono 后端
│       ├── src/
│       │   ├── db/schema.ts    # Drizzle schema
│       │   ├── routes/         # API 端点
│       │   └── middleware/     # auth/rate-limit/audit
│       └── ...
├── data/                       # SQLite 数据库文件
│   └── myblog.db               # 主库（含 -wal -shm）
├── docs/
│   ├── prd-1.0.md              # 已归档
│   └── prd-2.0.md              # 当前规划
├── scripts/                    # 工具脚本（Playwright 截图、seed、迁移）
├── uploads/                    # 用户上传
└── CLAUDE.md                   # 本文件
```

---

## 3. 常用命令

> 项目使用 **npm**（`package-lock.json`），不是 pnpm。脚本都通过 `npm-run-all` 并行。

```bash
# 安装
npm install

# 启动开发（一键并行三个服务，单终端即可）
npm run dev          # api (8787) + web (4321) + admin (4322)

# 单启动
npm run dev:api      # 只起 api
npm run dev:web      # 只起 web
npm run dev:admin    # 只起 admin

# 构建（顺序：shared → api → web → admin）
npm run build

# 数据库相关（自动迁移在 api 启动时跑，无需手动）
npm run db:migrate   # 执行 migrate（幂等）
npm run db:seed      # 填充示例数据（幂等）

# 截图验证（移动端视口）
node scripts/snap-viewports.mjs
```

> **`.env` 路径**：api 的 env 加载基于文件位置（`apps/api/src/utils/env.ts`），
> 不依赖 cwd —— 从 monorepo 根目录 `npm run dev` 也能正确读到 `apps/api/.env`。
> 同样，`DB_PATH` 相对 `apps/api/` 解析，默认 `../../data/myblog.db`。

---

## 4. ⚠️ 已知陷阱（History of Bugs）

### 4.1 Hono 中间件工厂陷阱
**症状**：路由返回 404 / `undefined`，中间件不生效。
**原因**：Hono 中间件**必须**是 handler 函数本身，不能是返回 handler 的工厂。
```ts
// ❌ 错误
app.use('/api/*', authMiddleware());   // 工厂调用
// ✅ 正确
app.use('/api/*', authMiddleware);     // 直接传 handler
```
**详见**：`memory/middleware-factory-trap.md`

### 4.2 Astro + React + framer-motion Hydration 报错
**症状**：浏览器控制台报 `Cannot read properties of null (reading 'useState')` 或 hydration mismatch。
**原因**：SSR 与客户端 React 副本重复加载。
**修复**：`apps/web/astro.config.mjs` 中加：
```js
vite: {
  optimizeDeps: {
    dedupe: ['react', 'react-dom'],
  },
}
```
**详见**：`memory/astro-react-hydration.md`

### 4.3 浏览器端不能用 `Cookie` header
**症状**：fetch 调用被浏览器拦截或报 CORS 错误。
**原因**：浏览器 fetch API 禁止 `Cookie` header（必须用 `credentials: 'include'` + Set-Cookie）。
**修复**：鉴权改用**自定义 header**（如 `X-Session-Token`）或 `credentials: 'include'`。
**详见**：`memory/browser-cookie-forbidden.md`

### 4.4 草稿乱码（PRD 2.0 §7.3）
**症状**：管理后台编辑 AI 草稿时，标题/正文出现 `?` 或 `â€™` 等乱码。
**优先级**：P2 修复任务。
**排查清单**：见 `docs/prd-2.0.md` §7.3。

### 4.5 `ch` 单位对中文不准
**症状**：用 `width: 12.6ch` 裁切中文字符时溢出或裁切错位。
**原因**：1ch ≈ 0.5em（拉丁字符），中文字符宽度 ≈ 1em。
**修复**：中英混排用 `width: 1.4 * ch` 或直接 `flex justify-end` 不依赖 width。

### 4.6 Astro Dev Toolbar 被误认为「悬浮菜单」
**症状**：用户问「页面底部那 4 个按钮是干什么的」。
**实际**：Astro dev mode 自动注入的开发者工具栏（仅 dev 模式出现，prod 无）。
**关闭**：`astro.config.mjs` 加 `devToolbar: { enabled: false }`（需重启 dev server）。

---

## 5. 用户偏好 / 反馈（必须遵守）

### 5.1 不要乱猜，有问题先确认
> **原文**：「你不要乱猜我的意思，有问题先和我确定」

- 涉及视觉/交互/数据选择，**先用 AskUserQuestion 澄清**再动手。
- 不要默认按「行业最佳实践」猜。
- 多个方案并存时，列出选项让用户选，不要单方面决定。

### 5.2 移动端不独立版本
- **只调参，不动结构**。
- 适配目标视口：320 / 375 / 414 / 768。
- 字号用 `clamp(min, vw, max)` 流体。
- 桌面版用 `md:` 前缀覆盖。

### 5.3 错落排版
- Hero 5 行不完全对齐，2/3 行刻意右挪 1-2 字。
- 「与」单独居中、靠右、加 ✦ 装饰。

### 5.4 「差不多就行」的哲学
- 完美对齐不重要，但视觉一致性、字号节奏、间距梯度重要。
- 改完先截图验证，再问用户。

### 5.5 PRD 是 AI 行动指南
- PRD 2.0 写完后，**实施必须按 PRD 章节顺序**（§11 实施优先级）。
- 遇到 PRD 未覆盖的情况，**先问**，不要假设。
- 任何架构变更需同步更新 PRD 对应章节。

### 5.6 禁止 TODO / 占位 / 未实现
- 写代码时**禁止**出现 `TODO` / `FIXME` / `XXX` / `待实现` / 占位页面 / 假数据假装成功。
- 一次性交付的代码必须功能完整：所有按钮、入口、API 必须真实可用，路径必须连通。
- 如确实需要分阶段实现，**先告知用户并确认方案**，再创建独立分支/PR —— 禁止在主分支代码里留 TODO。
- 异常分支也必须真实处理（错误提示、回退、空状态），禁止「留个 alert 占位」。
- 交付前自检：`grep -RIn "TODO\|FIXME\|XXX\|待实现" apps/ --include="*.ts" --include="*.tsx"` 应为空。

---

## 6. 设计语言速记

| 元素 | 规范 |
| :--- | :--- |
| 主色 | `--accent: #7c3aed`（紫）|
| 辅色 | `--accent-2`（粉）`--accent-3`（蓝）|
| 字体 | Display: italic serif（如 Fraunces）; Body: 中文用 Noto Sans SC |
| 圆角 | `12px`（可在设置里改）|
| 动效 | framer-motion spring + view transitions |
| 光标 | 自定义磁性圆环 + 圆点（移动端禁用）|
| 加载 | 品牌动画 Loading → 内容渐显 |
| 主题 | dark / light 切换，CSS 变量驱动 |

---

## 7. 编码约定

- **TypeScript** 全量。
- **React 组件**：默认客户端组件；纯展示可用 `.astro`。
- **API 路由**：Hono handler 形式，统一返回 `{ data, error }`。
- **数据库**：Drizzle schema 改完必须跑 `db:generate` 生成迁移。
- **Markdown**：Shiki 构建时高亮 + remark-gfm；自定义容器 `:::tip / warning / danger / info`。
- **不要在 React 组件里直接 `localStorage`**，用 `useEffect` + 初始值 fallback。
- **路径别名**：`@/` → `apps/web/src/`。

---

## 8. 文档位置速查

| 想了解 | 看哪里 |
| :--- | :--- |
| 第一阶段已实现 | `docs/prd-1.0.md` |
| 第二阶段规划 | `docs/prd-2.0.md` |
| 已知 bug / 陷阱 | `memory/` 目录 + 本文件 §4 |
| 数据模型 | `apps/api/src/db/schema.ts` |
| API 端点 | `apps/api/src/routes/` |
| 前端组件 | `apps/web/src/components/` |
| 截图/视觉验证 | `scripts/snap-*.mjs` |
| 移动端规范 | 本文件 §5.2 |

---

## 9. 自动记忆

Claude Code 会在 `C:\Users\24062\.claude\projects\C--Users-24062-Desktop-myblog\memory\` 维护项目记忆。新发现的非显然事实（如 bug 修复、用户偏好调整、架构决策）应通过 `Write` 工具写入独立 md 文件 + `MEMORY.md` 一行索引。

**适合写入记忆的**：
- 修复了一个隐蔽 bug（写「症状 + 修复」）
- 用户对某类工作流的新反馈（写「why + how to apply」）
- 临时决定但可能影响未来的（写「日期 + 决定 + 原因」）

**不适合写入的**：
- 代码结构、命名（git 能查）
- 通用最佳实践（Claude 已知道）
- 一次性的对话（信息密度低）

---

> **维护者**：本文件随项目演进，重大架构变更或用户偏好变化需同步更新。
