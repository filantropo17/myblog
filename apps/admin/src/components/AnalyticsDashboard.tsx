/**
 * 数据分析（/admin/analytics 路由）。
 *
 * 全部使用纯 SVG / CSS 实现图表，避免引入 Chart.js / ECharts，
 * 与"视觉优先 + 极简"的整体语言一致。
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { adminApi } from '../lib/admin-api';

type Source = { source: string; label: string; count: number };
type Trend = { date: string; views: number };
type CommentTrend = { date: string; count: number };
type TopPost = { id: number; slug: string; title: string; views: number };
type TopTag = { name: string; slug: string; count: number };
type Stats = { todayPV: number; yesterdayPV: number; weekPV: number; totalPosts: number };
type VibeStats = { monthCount: number; totalLikes: number };

export function AnalyticsDashboard() {
  const [data, reload] = useData();

  if (!data) return <p className="text-sm text-ink-500">加载中…</p>;

  const { stats, trend, sources, topPosts, vibeStats, topTags, commentsTrend } = data;

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">数据分析</h2>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-500">
            流量 · 来源 · 内容
          </p>
        </div>
        <button
          onClick={() => reload()}
          className="rounded border border-ink-700 px-3 py-1 font-mono text-xs hover:border-accent"
        >
          刷新
        </button>
      </header>

      <StatCards stats={stats} vibeStats={vibeStats} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart trend={trend} />
        </div>
        <CommentTrendChart trend={commentsTrend} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SourceDistribution sources={sources} />
        <TopTagsCloud tags={topTags} />
      </section>

      <TopPostsTable posts={topPosts} />
    </div>
  );
}

// ============================================================================
// 数据加载
// ============================================================================

function useData() {
  const [data, setData] = useState<{
    stats: Stats;
    trend: Trend[];
    sources: Source[];
    topPosts: TopPost[];
    vibeStats: VibeStats;
    topTags: TopTag[];
    commentsTrend: CommentTrend[];
  } | null>(null);

  const reload = async () => {
    setData(null);
    const r = await adminApi.analytics();
    setData(r);
  };
  useEffect(() => {
    reload();
  }, []);
  return [data, reload] as const;
}

// ============================================================================
// 组件
// ============================================================================

function StatCards({ stats, vibeStats }: { stats: Stats; vibeStats: VibeStats }) {
  const cards = [
    { label: '今日 PV', value: stats.todayPV, sub: `昨日 ${stats.yesterdayPV}` },
    { label: '本周 PV', value: stats.weekPV, sub: null },
    { label: '已发布文章', value: stats.totalPosts, sub: null },
    { label: 'Vibe 笔记', value: vibeStats.monthCount, sub: `共 ${vibeStats.totalLikes} 赞` },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-ink-800 bg-ink-900/40 p-4"
        >
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-500">{c.label}</p>
          <p className="mt-2 font-display text-3xl font-light text-ink-100">{c.value}</p>
          {c.sub && <p className="mt-1 font-mono text-[10px] text-ink-500">{c.sub}</p>}
        </motion.div>
      ))}
    </section>
  );
}

function TrendChart({ trend }: { trend: Trend[] }) {
  const { path, areaPath, max, points } = useMemo(() => buildLinePath(trend, 600, 140), [trend]);
  const [hover, setHover] = useState<{ x: number; y: number; row: Trend } | null>(null);

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-ink-500">最近 30 天 PV 趋势</h3>
        <span className="font-mono text-[10px] text-ink-500">峰值 {max}</span>
      </header>
      <svg viewBox="0 0 600 140" className="h-32 w-full">
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--admin-accent, #7c3aed)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--admin-accent, #7c3aed)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 网格 */}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="0"
            x2="600"
            y1={(140 / 3) * i}
            y2={(140 / 3) * i}
            stroke="currentColor"
            strokeOpacity="0.06"
          />
        ))}
        <path d={areaPath} fill="url(#trend-fill)" />
        <path d={path} fill="none" stroke="var(--admin-accent, #7c3aed)" strokeWidth="1.5" />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hover?.row === trend[i] ? 3 : 1.5}
              fill="var(--admin-accent, #7c3aed)"
              opacity={hover && hover.row !== trend[i] ? 0.5 : 1}
            />
            <rect
              x={p.x - 15}
              y="0"
              width="30"
              height="140"
              fill="transparent"
              onMouseEnter={() => setHover({ x: p.x, y: p.y, row: trend[i] })}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1="0" y2="140" stroke="var(--admin-accent, #7c3aed)" strokeOpacity="0.3" />
            <text x={hover.x} y={hover.y - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.8">
              {hover.row.views}
            </text>
          </g>
        )}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-500">
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function CommentTrendChart({ trend }: { trend: CommentTrend[] }) {
  const max = Math.max(1, ...trend.map((t) => t.count));
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-5">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-ink-500">评论活跃 30 天</h3>
        <span className="font-mono text-[10px] text-ink-500">峰值 {max}</span>
      </header>
      <div className="flex h-32 items-end gap-px">
        {trend.map((t) => (
          <div
            key={t.date}
            title={`${t.date}: ${t.count}`}
            className="flex-1 rounded-t bg-gradient-to-t from-fuchsia-500/30 to-fuchsia-500"
            style={{ height: `${Math.max(1, (t.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-500">
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function SourceDistribution({ sources }: { sources: Source[] }) {
  const total = sources.reduce((acc, s) => acc + s.count, 0);
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-5">
      <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-ink-500">来源分布</h3>
      {sources.length === 0 ? (
        <p className="text-sm text-ink-500">还没有访问记录</p>
      ) : (
        <ul className="space-y-2">
          {sources.map((s) => {
            const pct = total ? Math.round((s.count / total) * 100) : 0;
            return (
              <li key={s.source} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-ink-200">{s.label}</span>
                  <span className="font-mono text-ink-500">
                    {s.count} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-ink-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-accent to-fuchsia-500"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TopTagsCloud({ tags }: { tags: TopTag[] }) {
  const max = Math.max(1, ...tags.map((t) => t.count));
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-5">
      <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-ink-500">热门标签</h3>
      {tags.length === 0 ? (
        <p className="text-sm text-ink-500">暂无标签数据</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const scale = 0.7 + (t.count / max) * 0.6;
            return (
              <span
                key={t.slug}
                title={`${t.count} 篇`}
                className="rounded-full border border-ink-700 bg-white/[0.02] px-3 py-1 font-mono text-ink-200"
                style={{ fontSize: `${scale}rem` }}
              >
                #{t.name}
                <span className="ml-1.5 text-[10px] text-ink-500">{t.count}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopPostsTable({ posts }: { posts: TopPost[] }) {
  const max = Math.max(1, ...posts.map((p) => p.views));
  return (
    <section className="rounded-lg border border-ink-800 bg-ink-900/40 p-5">
      <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-ink-500">Top 10 文章</h3>
      <ol className="space-y-2">
        {posts.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3">
            <span className="w-6 font-mono text-xs text-ink-500">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex-1">
              <a
                href={`/posts/${p.slug}`}
                target="_blank"
                rel="noopener"
                className="text-sm text-ink-100 hover:text-accent"
              >
                {p.title}
              </a>
              <div className="mt-1 h-1 overflow-hidden rounded bg-ink-800">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.views / max) * 100}%` }}
                  transition={{ duration: 0.6 }}
                  className="h-full bg-gradient-to-r from-accent/60 to-accent"
                />
              </div>
            </div>
            <span className="w-16 text-right font-mono text-xs text-ink-500">{p.views}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ============================================================================
// 工具
// ============================================================================

function buildLinePath(trend: Trend[], w: number, h: number) {
  const n = trend.length;
  const max = Math.max(1, ...trend.map((t) => t.views));
  const stepX = w / Math.max(1, n - 1);
  const points = trend.map((t, i) => ({
    x: i * stepX,
    y: h - (t.views / max) * h * 0.9 - 4,
  }));
  let path = '';
  points.forEach((p, i) => {
    if (i === 0) path += `M ${p.x} ${p.y}`;
    else {
      const prev = points[i - 1];
      const cx = (prev.x + p.x) / 2;
      path += ` C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
    }
  });
  const areaPath = `${path} L ${w} ${h} L 0 ${h} Z`;
  return { path, areaPath, points, max };
}