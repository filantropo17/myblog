/**
 * 首页 Hero —— 打字机效果 + 视差标题 + 极光背景。
 */
import { motion } from 'framer-motion';
import { TypewriterText } from './TypewriterText';
import { Magnetic } from './MagneticCard';

interface HomeHeroProps {
  config?: {
    title?: string;
    tagline?: string;
    description?: string;
    author?: {
      name?: string;
      avatar?: string;
      bio?: string;
      skills?: string[];
      socials?: Record<string, string | undefined>;
    };
  } | null;
  postsCount?: number;
  projectsCount?: number;
}

export function HomeHero({ config, postsCount = 0, projectsCount = 0 }: HomeHeroProps) {
  const name = config?.author?.name ?? 'Qianji Xiao';
  const tagline = config?.tagline ?? 'AI · Vibecoding · 实践';
  const skills = config?.author?.skills ?? ['Python', 'Claude Code', 'MCP', 'SKILL', 'Agent', 'RAG', 'Workflow'];
  // 用姓氏首字母作为头像占位大字母（"Qianji Xiao" → "X"）
  const initial = name.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? 'X';

  return (
    <section className="relative isolate overflow-hidden pb-12 pt-12 md:pb-20 md:pt-20">
      {/* 装饰用的极光晕 —— 仅限 hero 区域，弱化到不挡内容 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 30%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%), radial-gradient(50% 40% at 85% 70%, color-mix(in srgb, var(--accent-2) 14%, transparent), transparent 70%)',
        }}
      />

      <div className="mx-auto grid max-w-[1400px] gap-10 px-6 md:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] md:px-10">
        {/* 左侧：编辑风大标题 */}
        <div className="relative min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="eyebrow mb-6 flex items-center gap-3"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-70"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]"></span>
            </span>
            <span>个人博客 · 始于 2026</span>
          </motion.div>

          <h1
            className="font-display font-light leading-[1.1] tracking-[-0.04em] text-balance"
            // mobile (320-414): 2.25rem ~ 3rem, mid: 视口缩放, desktop: 6.5rem 上限
            style={{ fontSize: 'clamp(2.25rem, 7.5vw, 6.5rem)' }}
          >
            {/* 第 1 行 */}
            <span className="block">一间关于</span>
            {/* 第 2 行：主标打字机（慢，无光标，desktop 往右挪 1 字，mobile 不挪） */}
            <span className="block pl-0 md:pl-[1ch]">
              <TypewriterText
                words={['AI 工作流', '人机协作', 'Vibe Coding', '不断进化']}
                typingSpeed={120}
                deletingSpeed={60}
                pauseMs={2400}
                showCursor={false}
                className="font-display-italic text-gradient"
              />
            </span>
            {/* 第 3 行：desktop 往右挪 2 字，mobile 不挪 */}
            <span className="block pl-0 md:pl-[2ch]">的工作室</span>
            {/* 第 4 行：与 desktop 居中偏右 + 装饰，mobile 简单居中 */}
            <span
              className="flex items-baseline justify-end gap-4 pr-[6%] font-display-italic text-[var(--ink-soft)] md:pr-[18%]"
              style={{ fontSize: '0.5em' }}
            >
              <span aria-hidden className="h-px flex-1 max-w-[40%] bg-gradient-to-r from-transparent via-[var(--border-strong)] to-[var(--accent)]" />
              <span>与</span>
              <span aria-hidden className="font-display text-[var(--accent)] opacity-70">✦</span>
            </span>
            {/* 第 5 行：副标打字机（中速，靠右对齐，有光标） */}
            <span className="block text-right">
              <TypewriterText
                words={['技术的探索。', '精确的 prompt。', '思维的边界。', '凌晨的灵感。']}
                typingSpeed={80}
                deletingSpeed={40}
                pauseMs={1400}
                showCursor
                layout="block"
                className="text-gradient font-display-italic"
              />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)] md:text-xl text-pretty"
          >
            嗨，我是 <span className="font-medium text-[var(--ink)]">{name}</span>。
            <br className="hidden md:block" />
            {tagline} — 这里记录 prompt、对话与能跑起来的代码。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 flex flex-wrap items-center gap-3"
          >
            <Magnetic>
              <a href="/posts" className="btn btn-primary" data-cursor="hover">
                <span>阅读文章</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </Magnetic>
            <Magnetic>
              <a href="/projects" className="btn" data-cursor="hover">
                <span>查看项目</span>
              </a>
            </Magnetic>
            <span className="ml-2 hidden font-mono text-xs uppercase tracking-wider text-[var(--ink-mute)] md:inline-flex">
              ↓ 滚动
            </span>
          </motion.div>
        </div>

        {/* 右侧：带头像与元信息的浮动卡片 */}
        <motion.aside
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div className="card relative overflow-hidden !p-0">
            <div className="relative aspect-[4/3] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/30 via-[var(--accent-2)]/20 to-[var(--accent-3)]/30" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="relative">
                  <div className="absolute -inset-12 rounded-full bg-[var(--accent)]/20 blur-3xl" />
                  <div className="relative font-display text-[12rem] font-light leading-none text-[var(--ink)] opacity-20">
                    {initial}
                  </div>
                </div>
              </div>
              <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-3">
                <div>
                  <div className="eyebrow mb-1 text-[var(--ink)]">作者</div>
                  <div className="font-display text-2xl font-medium tracking-tight">{name}</div>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-soft)] backdrop-blur-md">
                  <span className="font-mono text-xs">✦</span>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid grid-cols-3 gap-3 border-y border-[var(--border)] py-4 text-center">
                <div>
                  <div className="font-display text-2xl font-medium">{postsCount}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">文章</div>
                </div>
                <div>
                  <div className="font-display text-2xl font-medium">{projectsCount}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">项目</div>
                </div>
                <div>
                  <div className="font-display text-2xl font-medium">2026</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">在线</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="eyebrow">技术栈</div>
                <div className="flex flex-wrap gap-1.5">
                  {skills.slice(0, 8).map((s) => (
                    <span
                      key={s}
                      className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-soft)]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.aside>
      </div>
    </section>
  );
}
