/**
 * 文章卡片 —— 用于列表展示。
 * 错落入场 + 悬停发光效果。
 */
import { motion } from 'framer-motion';
import { Magnetic } from './MagneticCard';
import { formatDate } from '../lib/theme';

interface PostCardProps {
  post: {
    slug: string;
    title: string;
    excerpt?: string | null;
    coverImageUrl?: string | null;
    category?: string | null;
    tags?: string[];
    publishedAt?: string | null;
    readingTime?: number;
  };
  index?: number;
  variant?: 'grid' | 'list' | 'feature';
}

const categoryLabel: Record<string, { label: string; color: string }> = {
  tech: { label: '技术', color: 'aurora-violet' },
  project: { label: '项目', color: 'aurora-emerald' },
  diary: { label: '随笔', color: 'aurora-amber' },
};

export function PostCard({ post, index = 0, variant = 'grid' }: PostCardProps) {
  const cat = categoryLabel[post.category ?? ''] ?? categoryLabel.tech;

  if (variant === 'feature') {
    return (
      <motion.article
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="group relative grid grid-cols-1 gap-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-6 transition-all hover:border-[var(--border-strong)] md:grid-cols-[1.4fr_1fr] md:gap-10 md:p-10"
      >
        <a href={`/posts/${post.slug}`} className="absolute inset-0 z-10" aria-label={post.title} />
        <div className="flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className={`badge text-${cat.color}`}>
                <span className="badge-dot" />
                {cat.label}
              </span>
              <span className="eyebrow">{formatDate(post.publishedAt)}</span>
            </div>
            <h2 className="vt-title font-display text-3xl font-medium leading-[1.1] tracking-tight md:text-5xl">
              <span className="bg-gradient-to-br from-[var(--ink)] to-[var(--ink-soft)] bg-clip-text text-transparent transition-all group-hover:from-[var(--accent)] group-hover:to-[var(--accent-2)]">
                {post.title}
              </span>
            </h2>
            {post.excerpt && (
              <p className="max-w-prose text-base text-[var(--ink-soft)] md:text-lg text-pretty">
                {post.excerpt}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(post.tags ?? []).slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full border border-[var(--border)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]"
              >
                {t}
              </span>
            ))}
            <span className="ml-auto font-mono text-xs text-[var(--ink-mute)]">
              {post.readingTime ?? 5} min · 阅读
            </span>
          </div>
        </div>

        <div className="relative aspect-[5/4] overflow-hidden rounded-xl bg-gradient-to-br from-[var(--accent)]/20 via-[var(--accent-2)]/10 to-transparent md:aspect-auto">
          {post.coverImageUrl ? (
            <img
              src={post.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <div className="font-display text-7xl font-light opacity-30">M</div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)]/30 to-transparent" />
        </div>
      </motion.article>
    );
  }

  if (variant === 'list') {
    return (
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-30px' }}
        transition={{ duration: 0.5, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="group relative"
      >
        <a href={`/posts/${post.slug}`} className="block py-6">
          <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-6">
            <span className="font-mono text-xs text-[var(--ink-mute)]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <h3 className="font-display text-xl font-medium leading-snug tracking-tight transition-colors group-hover:text-[var(--accent)] md:text-2xl">
                {post.title}
              </h3>
              {post.excerpt && (
                <p className="mt-2 line-clamp-1 text-sm text-[var(--ink-mute)]">
                  {post.excerpt}
                </p>
              )}
            </div>
            <div className="hidden text-right md:block">
              <div className="eyebrow">{formatDate(post.publishedAt)}</div>
              <div className="mt-1 font-mono text-xs text-[var(--ink-mute)]">
                {post.readingTime ?? 5} min
              </div>
            </div>
          </div>
          <div className="mt-3 ml-12 flex flex-wrap items-center gap-2">
            <span className={`badge text-${cat.color}`}>
              <span className="badge-dot" />
              {cat.label}
            </span>
            {(post.tags ?? []).slice(0, 3).map((t) => (
              <span key={t} className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
                #{t}
              </span>
            ))}
          </div>
        </a>
      </motion.article>
    );
  }

  // 网格布局
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.6, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="card card-hover-glow group relative"
      onMouseMove={(e) => {
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        el.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      }}
    >
      <a href={`/posts/${post.slug}`} className="block">
        <div className="relative mb-5 aspect-[5/3] overflow-hidden rounded-lg">
          {post.coverImageUrl ? (
            <img
              src={post.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[var(--accent)]/15 to-[var(--accent-2)]/5">
              <span className="font-display text-5xl opacity-20">M</span>
            </div>
          )}
          <div className="absolute left-3 top-3">
            <span className={`badge text-${cat.color} backdrop-blur-md bg-[var(--bg)]/70`}>
              <span className="badge-dot" />
              {cat.label}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="vt-title font-display text-lg font-medium leading-snug tracking-tight transition-colors group-hover:text-[var(--accent)] md:text-xl text-balance">
            {post.title}
          </h3>
          {post.excerpt && (
            <p className="line-clamp-2 text-sm leading-relaxed text-[var(--ink-mute)] text-pretty">
              {post.excerpt}
            </p>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="font-mono text-[var(--ink-mute)]">
            {formatDate(post.publishedAt)}
          </span>
          <Magnetic>
            <span className="inline-flex items-center gap-1 font-mono text-[var(--accent)]">
              <span>阅读</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </Magnetic>
        </div>
      </a>
    </motion.article>
  );
}
