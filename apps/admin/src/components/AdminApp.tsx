/**
 * 管理后台登录 + 主面板外壳。
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminApi, getAuth, clearAuth } from '../lib/admin-api';
import { Dashboard } from './Dashboard';
import { PostManager } from './PostManager';
import { PostEditor } from './PostEditor';
import { ProjectManager } from './ProjectManager';
import { McpConsole } from './McpConsole';
import { LlmConfig } from './LlmConfig';
import { ThemeToggle } from './ThemeToggle';
import { VibeManager } from './VibeManager';
import { VibeEditor } from './VibeEditor';
import { CommentModerator } from './CommentModerator';
import { UserManager } from './UserManager';
import { SubscriberManager } from './SubscriberManager';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { SearchIndexAdmin } from './SearchIndexAdmin';

// ----------------------------------------------------------------------------
// Tab 模型：4 个主分组 + 右侧 AI 浮窗
// ----------------------------------------------------------------------------

type Tab =
  | 'dashboard'
  | 'posts'
  | 'projects'
  | 'vibe'
  | 'comments'
  | 'users'
  | 'subscribers'
  | 'analytics'
  | 'search'
  | 'mcp'
  | 'llm'
  | 'post-new'
  | `post-edit-${number}`
  | 'vibe-new'
  | `vibe-edit-${number}`;

type GroupKey = 'overview' | 'content' | 'ops' | 'data';

const TABS: { key: Tab; label: string; group: GroupKey; glyph: string }[] = [
  // 概览
  { key: 'dashboard', label: '仪表盘', group: 'overview', glyph: '◐' },

  // 内容
  { key: 'posts', label: '文章', group: 'content', glyph: '☰' },
  { key: 'vibe', label: 'Vibe 笔记', group: 'content', glyph: '✦' },
  { key: 'projects', label: '项目', group: 'content', glyph: '⬡' },

  // 运营
  { key: 'comments', label: '评论审核', group: 'ops', glyph: '☉' },
  { key: 'subscribers', label: '订阅者', group: 'ops', glyph: '✉' },
  { key: 'users', label: '用户管理', group: 'ops', glyph: '◍' },

  // 数据
  { key: 'analytics', label: '数据分析', group: 'data', glyph: '▤' },
  { key: 'search', label: '搜索索引', group: 'data', glyph: '⌕' },
];

const GROUP_META: Record<GroupKey, { label: string }> = {
  overview: { label: '概览' },
  content: { label: '内容' },
  ops: { label: '运营' },
  data: { label: '数据' },
};

const GROUP_ORDER: GroupKey[] = ['overview', 'content', 'ops', 'data'];

// AI 浮窗（顶级 nav 不显示，藏在右上角 ⌬ 按钮里）
const AI_TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'mcp', label: 'MCP 控制台', hint: '外部 AI agent 工具清单 + 活动日志' },
  { key: 'llm', label: '对话 AI 管理', hint: '站内 chat 的开关 + LLM 配置' },
];

export function AdminApp() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [checking, setChecking] = useState(true);
  const [openMenu, setOpenMenu] = useState<GroupKey | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeGroup: GroupKey =
    tab === 'dashboard' || tab.startsWith('post-')
      ? 'overview'
      : tab.startsWith('vibe-')
        ? 'overview'
        : TABS.find((t) => t.key === tab)?.group ?? 'overview';

  // hash 路由：tab 改变时同步 URL；外部修改 hash（后退/前进）时同步 tab
  const goTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.hash = `#/${t}`;
    history.replaceState(null, '', url.toString());
  };

  useEffect(() => {
    const onHash = () => {
      const m = window.location.hash.replace(/^#\//, '');
      if (m && m !== tab) setTab(m as Tab);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterMenu = (g: GroupKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMenu(g);
  };
  const leaveMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 180);
  };

  const enterAi = () => {
    if (aiCloseTimer.current) clearTimeout(aiCloseTimer.current);
    setAiOpen(true);
  };
  const leaveAi = () => {
    if (aiCloseTimer.current) clearTimeout(aiCloseTimer.current);
    aiCloseTimer.current = setTimeout(() => setAiOpen(false), 200);
  };

  // hover 进入 dropdown 时取消关闭计时（让光标有时间从按钮滑到面板）
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const cancelAiClose = () => {
    if (aiCloseTimer.current) clearTimeout(aiCloseTimer.current);
  };

  useEffect(() => {
    const a = getAuth();
    if (a) {
      // 通过尝试加载统计信息来验证登录状态
      adminApi.stats().then(
        () => {
          setAuthed(true);
          setChecking(false);
        },
        () => {
          clearAuth();
          setAuthed(false);
          setChecking(false);
        }
      );
    } else {
      setChecking(false);
    }
  }, []);

  // 全局监听 401 事件：cookie 中途失效时自动跳回登录页
  useEffect(() => {
    const onAuthLost = () => {
      clearAuth();
      setAuthed(false);
      setTab('dashboard');
    };
    window.addEventListener('auth:logout', onAuthLost);
    return () => window.removeEventListener('auth:logout', onAuthLost);
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-300">
        <div className="font-mono text-xs uppercase tracking-widest text-ink-500">加载中…</div>
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen bg-ink-950">
      {/* 顶部栏 —— 使用 on-bg 语义色，确保 light/dark 都正常 */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          background: 'color-mix(in srgb, var(--admin-bg) 82%, transparent)',
          borderColor: 'var(--admin-border)',
          boxShadow: '0 1px 0 0 var(--admin-border)',
        }}
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:flex-nowrap md:gap-6 md:px-6">
          <div className="flex shrink-0 items-center gap-3 md:gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-fuchsia-500 font-display text-sm text-white">
              m
            </div>
            <div className="hidden md:block">
              <div className="font-display text-base font-medium leading-none tracking-tight text-ink">
                myblog <span className="text-ink-500">/ 管理后台</span>
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-500">
                v2.0 · 2026
              </div>
            </div>
          </div>

          <nav className="order-3 flex w-full flex-wrap items-center justify-center gap-1 md:order-2 md:w-auto md:flex-nowrap">
            {GROUP_ORDER.map((g) => {
              const open = openMenu === g;
              const active = activeGroup === g;
              return (
                <div
                  key={g}
                  className="relative"
                  onMouseEnter={() => enterMenu(g)}
                  onMouseLeave={leaveMenu}
                >
                  <button
                    onClick={() => {
                      // 点击：跳到该分组第一个 tab，并保留 dropdown 打开
                      const first = TABS.find((t) => t.group === g);
                      if (first) goTab(first.key);
                      setOpenMenu(g);
                    }}
                    className={`group relative flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all md:gap-2 md:px-3.5 ${
                      open || active
                        ? 'bg-white/[0.06] text-ink'
                        : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-200'
                    }`}
                  >
                    <span
                      className={`h-1 w-1 rounded-full transition-all ${
                        active ? 'bg-accent' : open ? 'bg-ink-300' : 'bg-transparent'
                      }`}
                    />
                    {GROUP_META[g].label}
                    <span
                      className={`font-mono text-[9px] text-ink-500 transition-transform ${
                        open ? 'rotate-180 text-ink-300' : ''
                      }`}
                    >
                      ▾
                    </span>
                  </button>

                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        onMouseEnter={cancelClose}
                        onMouseLeave={leaveMenu}
                        className="absolute left-1/2 top-[calc(100%+6px)] z-40 w-[220px] -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl"
                        style={{
                          background: 'var(--admin-bg-elev)',
                          borderColor: 'var(--admin-border-strong)',
                          boxShadow: 'var(--admin-shadow)',
                        }}
                      >
                        <div
                          className="border-b px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500"
                          style={{ borderColor: 'var(--admin-border)' }}
                        >
                          {GROUP_META[g].label}
                        </div>
                        <ul className="py-1">
                          {TABS.filter((t) => t.group === g).map((t) => {
                            const sel = tab === t.key;
                            return (
                              <li key={t.key}>
                                <button
                                  onClick={() => {
                                    goTab(t.key);
                                    setOpenMenu(null);
                                  }}
                                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs transition-colors ${
                                    sel
                                      ? 'bg-accent/10 text-accent'
                                      : 'text-ink-200 hover:bg-white/[0.04]'
                                  }`}
                                >
                                  <span
                                    className={`font-display text-base leading-none ${
                                      sel ? 'text-accent' : 'text-ink-500'
                                    }`}
                                  >
                                    {t.glyph}
                                  </span>
                                  <span className="flex-1">{t.label}</span>
                                  {sel && (
                                    <span className="font-mono text-[9px] uppercase tracking-wider text-accent">
                                      ●
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>

          <div className="order-2 flex items-center gap-2 md:order-3 md:gap-3">
            {/* AI 浮窗按钮（不污染主导航） */}
            {/* AI 浮窗按钮（不污染主导航） */}
            <div
              className="relative"
              onMouseEnter={enterAi}
              onMouseLeave={leaveAi}
            >
              <button
                onClick={() => setAiOpen((v) => !v)}
                aria-label="AI 管理"
                className={`relative flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                  aiOpen || tab === 'mcp' || tab === 'llm'
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-200'
                }`}
              >
                <span className="font-display text-sm">⌬</span>
                {(tab === 'mcp' || tab === 'llm') && (
                  <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-400" />
                )}
              </button>
              <AnimatePresence>
                {aiOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    onMouseEnter={cancelAiClose}
                    onMouseLeave={leaveAi}
                    className="absolute right-0 top-[calc(100%+8px)] z-40 w-[260px] overflow-hidden rounded-xl border shadow-2xl"
                    style={{
                      background: 'var(--admin-bg-elev)',
                      borderColor: 'var(--admin-border-strong)',
                      boxShadow: 'var(--admin-shadow)',
                    }}
                  >
                    <div
                      className="flex items-center gap-2 border-b px-3 py-2"
                      style={{ borderColor: 'var(--admin-border)' }}
                    >
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
                        AI 维护
                      </span>
                    </div>
                    <ul className="py-1">
                      {AI_TABS.map((t) => {
                        const sel = tab === t.key;
                        return (
                          <li key={t.key}>
                            <button
                              onClick={() => {
                                goTab(t.key);
                                setAiOpen(false);
                              }}
                              className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                                sel
                                  ? 'bg-violet-500/10'
                                  : 'hover:bg-white/[0.04]'
                              }`}
                            >
                              <span
                                className={`mt-0.5 font-display text-base leading-none ${
                                  sel ? 'text-violet-300' : 'text-ink-500'
                                }`}
                              >
                                ⌬
                              </span>
                              <span className="flex-1">
                                <span
                                  className={`block text-xs ${
                                    sel ? 'text-violet-200' : 'text-ink-200'
                                  }`}
                                >
                                  {t.label}
                                </span>
                                <span className="mt-0.5 block font-mono text-[10px] leading-tight text-ink-500">
                                  {t.hint}
                                </span>
                              </span>
                              {sel && (
                                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-violet-300">
                                  ●
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div
                      className="border-t px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-ink-600"
                      style={{ borderColor: 'var(--admin-border)' }}
                    >
                      仅管理员 · 外部 agent 用 X-AI-API-Key
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <ThemeToggle />
            <a
              href="http://localhost:4321"
              target="_blank"
              rel="noreferrer"
              className="hidden whitespace-nowrap font-mono text-xs uppercase tracking-wider text-ink-400 transition-colors hover:text-ink md:inline"
            >
              查看站点 →
            </a>
            <button
              onClick={() => {
                clearAuth();
                setAuthed(false);
              }}
              className="whitespace-nowrap rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-400 transition-colors hover:border-red-500/40 hover:text-red-400 md:px-3"
              style={{ borderColor: 'var(--admin-border-strong)' }}
              aria-label="退出登录"
            >
              <span className="hidden md:inline">退出登录</span>
              <span className="md:hidden">⎋</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'posts' && (
              <PostManager
                onCreate={() => goTab('post-new')}
                onEdit={(id) => goTab(`post-edit-${id}` as Tab)}
              />
            )}
            {tab === 'projects' && <ProjectManager />}
            {tab === 'vibe' && (
              <VibeManager
                onCreate={() => goTab('vibe-new')}
                onEdit={(id) => goTab(`vibe-edit-${id}` as Tab)}
              />
            )}
            {tab === 'comments' && <CommentModerator />}
            {tab === 'users' && <UserManager />}
            {tab === 'subscribers' && <SubscriberManager />}
            {tab === 'analytics' && <AnalyticsDashboard />}
            {tab === 'search' && <SearchIndexAdmin />}
            {tab === 'mcp' && <McpConsole />}
            {tab === 'llm' && <LlmConfig />}
            {tab === 'post-new' && (
              <PostEditor postId={null} onBack={() => goTab('posts')} />
            )}
            {tab.startsWith('post-edit-') && (
              <PostEditor
                postId={Number(tab.slice('post-edit-'.length))}
                onBack={() => goTab('posts')}
              />
            )}
            {tab === 'vibe-new' && (
              <VibeEditor
                vibeId={null}
                onBack={() => goTab('vibe')}
                onSaved={() => goTab('vibe')}
              />
            )}
            {tab.startsWith('vibe-edit-') && (
              <VibeEditor
                vibeId={Number(tab.slice('vibe-edit-'.length))}
                onBack={() => goTab('vibe')}
                onSaved={() => goTab('vibe')}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await adminApi.login(username, password);
      onSuccess();
    } catch (err: any) {
      // 把英文后端错误翻成中文
      const msg = err?.message ?? '登录失败';
      setError(msg === 'Invalid credentials' ? '用户名或密码错误' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink-950">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute inset-0 bg-aurora" />

      {/* 主题切换也放在登录页 */}
      <div className="absolute right-5 top-5 z-20">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="card-elev relative z-10 w-full max-w-md p-10"
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-fuchsia-500 font-display text-base text-white">
            m
          </div>
          <div>
            <div className="font-display text-xl font-medium tracking-tight">myblog 管理后台</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
              登录后继续
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-400">
              用户名
            </label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-400">
              密码
            </label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center !py-2.5">
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        <div className="mt-6 border-t border-white/5 pt-4 font-mono text-[10px] uppercase tracking-wider text-ink-500">
          演示账号 · admin / myblog2026
        </div>
      </motion.div>
    </div>
  );
}