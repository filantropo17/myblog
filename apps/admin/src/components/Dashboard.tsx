/**
 * 管理后台 · 仪表盘。
 *
 * 视觉概念 —— 「Console Dashboard」：
 * - 顶部 Hero：标题 + 时间范围 Tab 选择器（7d/30d/90d）
 * - 6 个统计卡片（3×2 grid）：今日 PV / 昨日 PV / 周 PV / 待审评论 / 订阅者 / 注册用户
 * - 第二行：PV 趋势 SVG 折线图 + 来源分布 Top 5 横向条形图
 * - 第三行：Top 5 热门文章紧凑表
 *
 * 字体策略：数字大字号 Fraunces italic；标签 / 副标用 JetBrains Mono 小字大写
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { adminApi } from '../lib/admin-api';

type Range = '7d' | '30d' | '90d';
type AnalyticsData = Awaited<ReturnType<typeof adminApi.analytics>>;

export function Dashboard() {
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminApi
      .analytics(range)
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  const stats = data?.stats;
  const trend = data?.trend ?? [];
  const sources = data?.sources ?? [];
  const topPosts = data?.topPosts ?? [];

  return (
    <div className="space-y-6">
      {/* ============ Hero ============ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'
              }`}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              {loading ? '同步中…' : '实时同步'} · {new Date().toLocaleString('zh-CN')}
            </span>
          </div>
          <h1 className="font-display text-3xl font-medium italic tracking-tight text-ink md:text-4xl">
            仪表盘
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-400">
            TOTAL PULSE · 全站一览
          </p>
        </div>

        {/* 时间范围 Tab */}
        <div
          className="flex items-center gap-1 rounded-lg border p-1"
          style={{
            borderColor: 'var(--admin-border-strong)',
            background: 'var(--admin-bg-soft)',
          }}
        >
          {(['7d', '30d', '90d'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`relative rounded-md px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all ${
                range === r
                  ? 'bg-violet-500/20 text-violet-200 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.4)]'
                  : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ============ 6 个统计卡片 ============ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="今日 PV"
          value={stats?.todayPV ?? 0}
          sub="今日独立访问"
          accent="from-violet-500/60 to-fuchsia-500/60"
          loading={loading}
        />
        <StatCard
          label="昨日 PV"
          value={stats?.yesterdayPV ?? 0}
          sub="与今日对比"
          accent="from-sky-500/60 to-cyan-500/60"
          loading={loading}
        />
        <StatCard
          label="周 PV"
          value={stats?.weekPV ?? 0}
          sub="过去 7 天"
          accent="from-emerald-500/60 to-teal-500/60"
          loading={loading}
        />
        <StatCard
          label="待审评论"
          value={stats?.pendingComments ?? 0}
          sub="需处理"
          accent="from-amber-500/60 to-orange-500/60"
          loading={loading}
          alert={(stats?.pendingComments ?? 0) > 0}
        />
        <StatCard
          label="订阅者"
          value={stats?.subscribersCount ?? 0}
          sub="活跃"
          accent="from-pink-500/60 to-rose-500/60"
          loading={loading}
        />
        <StatCard
          label="注册用户"
          value={stats?.usersCount ?? 0}
          sub="活跃账号"
          accent="from-indigo-500/60 to-blue-500/60"
          loading={loading}
        />
      </div>

      {/* ============ 第二行：趋势 + 来源 ============ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* PV 趋势折线图 */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div>
              <h2 className="font-display text-base font-medium tracking-tight">
                浏览量趋势
              </h2>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-500">
                Page Views · 最近 {data?.range ?? 30} 天
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-500">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
                PV
              </span>
              <span className="font-mono text-xs tabular-nums text-ink-300">
                峰值 {Math.max(0, ...trend.map((t) => t.views))}
              </span>
            </div>
          </div>
          <div className="p-4">
            <TrendChart data={trend} loading={loading} />
          </div>
        </div>

        {/* 来源分布 */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div>
              <h2 className="font-display text-base font-medium tracking-tight">来源分布</h2>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-500">
                Referrer · Top {sources.length || 0}
              </p>
            </div>
          </div>
          <div className="p-4">
            <SourceList sources={sources} loading={loading} />
          </div>
        </div>
      </div>

      {/* ============ 第三行：Top 5 文章 ============ */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <div>
            <h2 className="font-display text-base font-medium tracking-tight">热门文章</h2>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-500">
              Top Posts · 按浏览量排序
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
            Top {topPosts.length}
          </span>
        </div>
        <TopPosts posts={topPosts} loading={loading} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 统计卡片
// ----------------------------------------------------------------------------
function StatCard({
  label,
  value,
  sub,
  accent,
  loading,
  alert,
}: {
  label: string;
  value: number;
  sub: string;
  accent: string;
  loading: boolean;
  alert?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`card relative overflow-hidden p-4 ${alert ? 'ring-1 ring-amber-500/30' : ''}`}
    >
      {/* 顶部渐变条 */}
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
        {label}
      </div>
      <div className="mt-2 font-display text-4xl font-medium italic tracking-tight tabular-nums text-ink md:text-5xl">
        {loading ? (
          <span className="inline-block h-9 w-12 animate-pulse rounded bg-white/[0.06]" />
        ) : (
          value.toLocaleString('zh-CN')
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {alert && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        )}
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
          {sub}
        </span>
      </div>
    </motion.div>
  );
}

// ----------------------------------------------------------------------------
// SVG 折线图
// ----------------------------------------------------------------------------
function TrendChart({
  data,
  loading,
}: {
  data: Array<{ date: string; views: number }>;
  loading: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { path, area, points, max, total } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', area: '', points: [] as any[], max: 0, total: 0 };
    }
    const max = Math.max(1, ...data.map((d) => d.views));
    const w = 100;
    const h = 100;
    const stepX = data.length > 1 ? w / (data.length - 1) : 0;
    const points = data.map((d, i) => ({
      x: i * stepX,
      y: h - (d.views / max) * h * 0.9 - h * 0.05,
      v: d.views,
      d: d.date,
    }));
    const path = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    const area = `${path} L ${w} ${h} L 0 ${h} Z`;
    const total = data.reduce((s, d) => s + d.views, 0);
    return { path, area, points, max, total };
  }, [data]);

  if (loading && data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
          加载中…
        </div>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
          暂无数据
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-display text-2xl font-medium italic tabular-nums">
          {total.toLocaleString('zh-CN')}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
          合计浏览
        </span>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-[200px] w-full"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(124, 58, 237)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(124, 58, 237)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="trend-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(167, 139, 250)" />
            <stop offset="100%" stopColor="rgb(232, 121, 249)" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1="0"
            y1={p * 100}
            x2="100"
            y2={p * 100}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="0.2"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill="url(#trend-fill)" />
        <path
          d={path}
          fill="none"
          stroke="url(#trend-stroke)"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 1 : 0.4}
              fill="rgb(232, 121, 249)"
              stroke="rgb(255,255,255)"
              strokeWidth="0.2"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={p.x - (data.length > 50 ? 0.8 : 2)}
              y="0"
              width={data.length > 50 ? 1.6 : 4}
              height="100"
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}

        {hover != null && (
          <line
            x1={points[hover].x}
            y1="0"
            x2={points[hover].x}
            y2="100"
            stroke="rgba(232, 121, 249, 0.4)"
            strokeWidth="0.2"
            strokeDasharray="1 1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 font-mono text-[10px] shadow-xl"
          style={{
            left: `${points[hover].x}%`,
            top: `${points[hover].y - 2}%`,
            background: 'var(--admin-bg-elev)',
            borderColor: 'var(--admin-border-strong)',
          }}
        >
          <div className="font-medium text-ink">{points[hover].v} PV</div>
          <div className="text-ink-500">{points[hover].d}</div>
        </div>
      )}

      <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-ink-600">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 来源分布
// ----------------------------------------------------------------------------
function SourceList({
  sources,
  loading,
}: {
  sources: Array<{ label: string; count: number; source: string }>;
  loading: boolean;
}) {
  const max = Math.max(1, ...sources.map((s) => s.count));

  if (loading && sources.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center font-mono text-[10px] uppercase tracking-wider text-ink-500">
        加载中…
      </div>
    );
  }
  if (sources.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center font-mono text-[10px] uppercase tracking-wider text-ink-500">
        暂无来源
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {sources.slice(0, 6).map((s, i) => (
        <li key={s.source + i} className="group">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="truncate text-xs text-ink-200">{s.label}</span>
            <span className="ml-2 shrink-0 font-mono text-[11px] tabular-nums text-ink-400">
              {s.count.toLocaleString('zh-CN')}
            </span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(s.count / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.04 }}
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------
// Top 5 热门文章
// ----------------------------------------------------------------------------
function TopPosts({
  posts,
  loading,
}: {
  posts: Array<{ id: number; slug: string; title: string; views: number }>;
  loading: boolean;
}) {
  const max = Math.max(1, ...posts.map((p) => p.views));
  const top = posts.slice(0, 5);

  if (loading && top.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center font-mono text-[10px] uppercase tracking-wider text-ink-500">
        加载中…
      </div>
    );
  }
  if (top.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center font-mono text-[10px] uppercase tracking-wider text-ink-500">
        暂无文章
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/5">
      {top.map((p, i) => (
        <li
          key={p.id}
          className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.02]"
        >
          <span
            className={`font-display text-2xl font-medium italic tabular-nums ${
              i === 0
                ? 'text-violet-300'
                : i === 1
                ? 'text-fuchsia-300'
                : i === 2
                ? 'text-amber-300'
                : 'text-ink-500'
            }`}
          >
            {String(i + 1).padStart(2, '0')}
          </span>

          <a
            href={`http://localhost:4321/posts/${p.slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate text-sm text-ink-200 transition-colors group-hover:text-violet-200"
          >
            {p.title}
          </a>

          <div className="hidden w-40 sm:block">
            <div className="relative h-1 overflow-hidden rounded-full bg-white/[0.04]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(p.views / max) * 100}%` }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500/70 to-fuchsia-400/70"
              />
            </div>
          </div>

          <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-ink-300">
            {p.views.toLocaleString('zh-CN')}
          </span>

          <span className="font-mono text-[10px] text-ink-600 transition-colors group-hover:text-violet-300">
            ↗
          </span>
        </li>
      ))}
    </ul>
  );
}

export default Dashboard;