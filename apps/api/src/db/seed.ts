/**
 * 用样例文章、项目和配置填充数据库，使前端开箱即用即有丰富内容。
 * 具备幂等性：重复运行不会产生重复数据。
 */
import '../utils/env.js'; // 必须第一行：基于文件位置加载 .env
import { migrate } from './migrate.js';
import { getDb, schema } from './index.js';
import { eq } from 'drizzle-orm';
import { generateSlug } from '../utils/slug.js';
import { estimateReadingTime } from '../utils/reading.js';
import { hashPassword } from '../utils/crypto.js';

const samplePosts = [
  {
    title: '用 View Transitions API 打造丝滑页面切换体验',
    excerpt:
      'View Transitions API 让浏览器原生支持页面级动画，本文带你深入理解其原理并在 Astro 项目中实践。',
    category: 'tech' as const,
    tags: ['Astro', 'CSS', '动效', '前端'],
    cover:
      'https://images.unsplash.com/photo-1551033406-611cf9a28f67?w=1600&auto=format&fit=crop',
    content: `# 用 View Transitions API 打造丝滑页面切换体验

> 浏览器原生支持的页面转场动画，零依赖、零运行时。

## 什么是 View Transitions API

View Transitions API 是一项 **浏览器原生** 的页面切换动画能力，它通过截取旧/新页面快照，自动在它们之间生成平滑过渡。

\`\`\`ts
function navigate(url: string) {
  // 一行代码搞定
  document.startViewTransition(() => {
    // 更新 DOM
    document.getElementById('content')!.innerHTML = '...';
    history.pushState({}, '', url);
  });
}
\`\`\`

## 同名元素共享动画

最强大的特性是 **view-transition-name** —— 拥有相同名字的元素在切换时会被自动配对，并执行 FLIP 动画：

\`\`\`css
.article-title {
  view-transition-name: post-title;
}
\`\`\`

:::tip 兼容性
Chrome 111+ 已支持稳定版，Safari 18+ 紧随其后。可使用 \`@supports\` 提供降级。
:::

## 与 Astro 结合

Astro 自带 \`ClientRouter\` 组件，已内置 View Transitions 支持。配合 \`transition:name\` 指令即可：

\`\`\`astro
<a href="/posts/some-slug">
  <h1 transition:name="post-title">文章标题</h1>
</a>
\`\`\`

这样从列表页跳到详情页时，标题会像被「提起」一样平滑变形放大，效果非常惊艳。`,
  },
  {
    title: '设计系统的色彩心理学：从对比到情绪',
    excerpt:
      '为什么 Linear 用紫色？为什么 Stripe 用蓝色？本文从色彩心理学角度解读设计系统的选色逻辑。',
    category: 'tech' as const,
    tags: ['设计', '色彩', '设计系统', '前端'],
    cover:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1600&auto=format&fit=crop',
    content: `# 设计系统的色彩心理学

## 颜色的力量

颜色不只是视觉装饰，更是 **潜意识对话**。每个色相都携带着文化共识：

- **蓝色** —— 信任、专业、稳定
- **紫色** —— 创造、神秘、高端
- **绿色** —— 自然、增长、安全
- **橙色** —— 活力、社交、行动

:::warning 注意
色彩心理受文化影响极大。同样的红色在西方代表危险，在中国则代表喜庆。
:::

## 60-30-10 法则

经典配色比例：

| 比例 | 用途 |
|------|------|
| 60% | 主色 (背景) |
| 30% | 次色 (内容容器) |
| 10% | 强调色 (CTA、链接) |

\`\`\`css
:root {
  --bg-primary: #0a0a0a;
  --bg-surface: #141414;
  --accent: hsl(258 89% 66%);
}
\`\`\`

## 暗色优先

现代设计系统的趋势是 **暗色优先**，原因有三：

1. OLED 屏幕普及，深色更省电
2. 深色环境降低眼睛疲劳
3. 暗色让彩色 accent 更突出`,
  },
  {
    title: '从零搭建 Astro + Hono 全栈博客',
    excerpt: '记录我搭建这个博客的全过程，包括架构选择、踩过的坑与最佳实践。',
    category: 'project' as const,
    tags: ['Astro', 'Hono', '全栈', '博客'],
    cover:
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1600&auto=format&fit=crop',
    content: `# 从零搭建 Astro + Hono 全栈博客

## 为什么选 Astro

- ⚡ **零 JS 默认** —— 静态输出，首屏 LCP < 1.5s
- 🏝 **Islands 架构** —— 交互组件按需注水
- 🎨 **框架无关** —— React/Vue/Svelte 随便用

## 为什么选 Hono

- 🪶 **超轻量** —— 比 Express 小 10x
- 🚀 **冷启动快** —— 适配 Serverless
- 🔥 **TypeScript 原生** —— 端到端类型安全

\`\`\`ts
import { Hono } from 'hono';
const app = new Hono();

app.get('/api/v1/posts', (c) => c.json({ posts: [] }));

export default app;
\`\`\`

## 数据层

SQLite (WAL) + Drizzle ORM，单文件、零进程、查询飞快。

## 部署

Nginx + PM2，2C2G 就能跑。`,
  },
  {
    title: '打造丝滑动画的 12 条原则',
    excerpt: '从迪士尼动画十二法则到现代 Web 动效实践。',
    category: 'tech' as const,
    tags: ['动效', 'Framer Motion', 'CSS'],
    cover:
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1600&auto=format&fit=crop',
    content: `# 打造丝滑动画的 12 条原则

## 1. Squash & Stretch（挤压与拉伸）

物体碰撞时拉伸、静止时压缩，赋予质感与重量。

## 2. Anticipation（预备动作）

出拳前先收回——预期让动画有故事感。

## 3. Staging（分镜）

重要元素必须 **视觉上突出**，不能淹没在背景里。

## 4. Straight Ahead vs Pose to Pose

- **Pose to Pose**：先关键帧再补间（生产环境首选）
- **Straight Ahead**：逐帧绘制（适合流体效果）

## 5. Follow Through（跟随动作）

披风、头发、尾巴不会立刻停下，会 **延迟跟随**。

\`\`\`ts
// Framer Motion 中实现跟随
<motion.div
  initial={{ x: 0 }}
  animate={{ x: 100 }}
  transition={{ type: 'spring', stiffness: 100, damping: 10 }}
/>
\`\`\`

## 6. Slow In & Slow Out

缓入缓出 —— ease-in-out 是默认选择，但要根据语境微调。

:::tip 黄金法则
永远不要用 \`linear\`。永远。
:::

(完整版将持续更新...)`,
  },
  {
    title: 'TypeScript 5.6 新特性速览',
    excerpt: '新增的 disallowed nullish、inferred type predicates 等特性。',
    category: 'tech' as const,
    tags: ['TypeScript', '前端', '类型系统'],
    cover:
      'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=1600&auto=format&fit=crop',
    content: `# TypeScript 5.6 新特性速览

## 1. Disallowed Nullish and Truthy Checks

\`\`\`ts
// 5.6 之前
if (str !== null && str !== undefined && str !== '') { ... }

// 5.6+
if (str) { ... } // 自动检查
\`\`\`

## 2. Inferred Type Predicates

\`\`\`ts
const arr = [1, 'a', null, 2, undefined];
// 自动推断 filter 类型
const nums = arr.filter((x): x is number => typeof x === 'number');
\`\`\`

## 3. Iterator Helper Methods

\`\`\`ts
function* gen() {
  yield 1; yield 2; yield 3;
}

const result = gen()
  .map(x => x * 2)
  .filter(x => x > 2)
  .toArray();
// [4, 6]
\`\`\`

## 4. Strict Builtin Iterator Checks

内置类型现在严格检查迭代器协议，类型推断更精准。

:::info 升级建议
5.6 是平滑升级，几乎无破坏性变更。建议开启 \`strict: true\` 后再升级。
:::`,
  },
  {
    title: '我的 2026 上半年书单',
    excerpt: '技术与非技术并重，从设计哲学到系统架构的 12 本精选。',
    category: 'diary' as const,
    tags: ['书单', '阅读', '随笔'],
    cover:
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1600&auto=format&fit=crop',
    content: `# 我的 2026 上半年书单

## 技术

1. **《Designing Data-Intensive Applications》** —— 重读仍震撼
2. **《A Philosophy of Software Design》** —— 复杂度即敌
3. **《Web Performance in Practice》** —— 性能预算的实操手册

## 设计

4. **《Interaction of Color》** —— Josef Albers，永远的经典
5. **《Universal Principles of Design》** —— 跨学科的设计字典

## 杂学

6. **《The Mom Test》** —— 客户访谈的金科玉律
7. **《Sapiens》** —— 重读，比第一次读更震撼

:::tip 阅读方法
技术书读两遍：第一遍通读抓骨架，第二遍带着项目读。
:::`,
  },
  {
    title: 'AI 辅助内容生产实践笔记',
    excerpt: '我如何用 Claude + GitHub workflow 让博客保持周更。',
    category: 'tech' as const,
    tags: ['AI', 'Claude', '效率'],
    cover:
      'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&auto=format&fit=crop',
    content: `# AI 辅助内容生产实践笔记

## 工作流

\`\`\`mermaid
graph LR
    A[GitHub Commit] -->|webhook| B[Claude]
    B -->|生成草稿| C[草稿池]
    C -->|人工审核| D[已发布]
\`\`\`

## 关键点

1. **草稿永远默认 draft** —— 人类是最后一道关
2. **回写修改意见** —— 让 AI 下次知道哪里不对
3. **版本历史可回滚** —— 实验要大胆，落地要谨慎

> AI 是杠杆，不是替代品。`,
  },
];

const sampleProjects = [
  {
    name: 'MyBlog',
    description: '一个视觉体验优先的个人技术博客系统，支持 AI 内容生成与人工审核闭环。',
    techStack: ['Astro', 'React', 'Hono', 'Drizzle', 'SQLite', 'Framer Motion', 'TypeScript'],
    githubUrl: 'https://github.com/example/myblog',
    demoUrl: 'https://myblog.example.com',
    status: 'active' as const,
    sortOrder: 1,
  },
  {
    name: 'Pixelpunk Studio',
    description: '为独立设计师打造的极简作品集生成器，3 分钟拥有炫酷个人主页。',
    techStack: ['Next.js', 'Tailwind', 'MDX', 'Cloudflare R2'],
    githubUrl: 'https://github.com/example/pixelpunk',
    demoUrl: 'https://pixelpunk.example.com',
    status: 'active' as const,
    sortOrder: 2,
  },
  {
    name: 'Markdown Snippets',
    description: 'VSCode 插件，AI 自动从代码中提取可复用的 Markdown 代码片段。',
    techStack: ['TypeScript', 'VSCode API', 'Claude API'],
    githubUrl: 'https://github.com/example/md-snippets',
    status: 'active' as const,
    sortOrder: 3,
  },
  {
    name: 'Aether UI',
    description: '基于 CSS Houdini 的下一代动效组件库，零运行时、GPU 加速。',
    techStack: ['CSS Houdini', 'Web Animations', 'Lit'],
    githubUrl: 'https://github.com/example/aether-ui',
    status: 'planned' as const,
    sortOrder: 4,
  },
  {
    name: 'Old Bookshelf',
    description: '把 GitHub stars 转成「个人书架」，按主题自动分类、可视化。',
    techStack: ['Astro', 'GitHub GraphQL', 'D3'],
    githubUrl: 'https://github.com/example/bookshelf',
    status: 'archived' as const,
    sortOrder: 5,
  },
];

const defaultSettings: Record<string, string> = {
  site_title: 'MyBlog',
  site_tagline: 'AI · Vibecoding · 实践',
  site_description:
    '一个以视觉体验优先的个人技术博客。这里记录代码、设计与对工艺的执着。',
  author_name: 'Qianji Xiao',
  author_avatar:
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop',
  author_bio: '全栈工程师 / 设计爱好者 / 终身学习者。',
  author_skills: JSON.stringify([
    'Python',
    'Claude Code',
    'MCP',
    'SKILL',
    'Agent',
    'RAG',
    'Workflow',
  ]),
  github_url: 'https://github.com/filantropo17',
  twitter_url: 'https://twitter.com/example',
  email: 'taiz11111111@gmail.com',
  theme_accent: '#7c3aed',
  theme_radius: '12px',
};

// env 中存在的作者信息会覆盖 seed 默认值
const envAuthorOverrides: Record<string, string | undefined> = {
  author_name: process.env.AUTHOR_NAME,
  email: process.env.AUTHOR_EMAIL,
  github_url: process.env.AUTHOR_GITHUB,
};
for (const [key, value] of Object.entries(envAuthorOverrides)) {
  if (value) defaultSettings[key] = value;
}

export function seed() {
  const db = getDb();
  const now = new Date().toISOString();

  // 管理员账号：从 env 引导首个 admin
  // 仅当 users 表为空时插入；密码 hash 是异步的，所以走 then
  const existingUsers = db.select({ id: schema.users.id }).from(schema.users).all();
  if (existingUsers.length === 0) {
    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
    const adminUser = process.env.ADMIN_USERNAME ?? 'admin';
    const adminPass = process.env.ADMIN_PASSWORD ?? 'changeme';
    // 走异步初始化（seed 由 index.ts 在启动时同步调用，返回 Promise）
    return hashPassword(adminPass).then((hash) => {
      db.insert(schema.users)
        .values({
          email: adminEmail,
          username: adminUser,
          passwordHash: hash,
          displayName: 'Administrator',
          role: 'admin',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      console.log(`✅ Seeded admin user '${adminUser}' (password from ADMIN_PASSWORD env)`);
      finishSeed(db, now);
    });
  }
  finishSeed(db, now);
  return Promise.resolve();
}

function finishSeed(db: ReturnType<typeof getDb>, now: string) {

  // 设置：存在则跳过；但 AUTHOR_* 相关的字段每次启动都用 env 同步（用户改了根 .env 立即生效）
  const authorSyncKeys = new Set(['author_name', 'email', 'github_url']);
  for (const [key, value] of Object.entries(defaultSettings)) {
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (!existing) {
      db.insert(schema.settings).values({ key, value, updatedAt: now }).run();
    } else if (authorSyncKeys.has(key) && process.env[`AUTHOR_${key === 'email' ? 'EMAIL' : key === 'github_url' ? 'GITHUB' : 'NAME'}`]) {
      // env 中显式设置了 → 覆盖 DB
      db.update(schema.settings)
        .set({ value, updatedAt: now })
        .where(eq(schema.settings.key, key))
        .run();
    }
  }

  // 文章（仅当表为空时插入）
  const existingPosts = db.select({ id: schema.posts.id }).from(schema.posts).all();
  if (existingPosts.length === 0) {
    for (let i = 0; i < samplePosts.length; i++) {
      const p = samplePosts[i];
      const slug = generateSlug(p.title, i + 1);
      const publishedAt = new Date(Date.now() - i * 3 * 86400000).toISOString();
      db.insert(schema.posts)
        .values({
          title: p.title,
          slug,
          content: p.content,
          excerpt: p.excerpt,
          category: p.category,
          tags: JSON.stringify(p.tags),
          status: 'published',
          sourceType: 'manual',
          seoDescription: p.excerpt,
          coverImageUrl: p.cover,
          publishedAt,
          createdAt: publishedAt,
          updatedAt: now,
        })
        .run();
    }
    console.log(`✅ Seeded ${samplePosts.length} posts`);
  }

  // 项目
  const existingProjects = db.select({ id: schema.projects.id }).from(schema.projects).all();
  if (existingProjects.length === 0) {
    for (const p of sampleProjects) {
      db.insert(schema.projects)
        .values({
          name: p.name,
          description: p.description,
          techStack: JSON.stringify(p.techStack),
          githubUrl: p.githubUrl,
          demoUrl: (p as any).demoUrl,
          status: p.status,
          sortOrder: p.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    console.log(`✅ Seeded ${sampleProjects.length} projects`);
  }

  console.log('🌱 Seed complete');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  seed();
}

export { samplePosts, sampleProjects, estimateReadingTime };
