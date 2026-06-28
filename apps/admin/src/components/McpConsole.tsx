/**
 * MCP 控制台（替代原 AI 控制台）。
 *
 * 视觉概念 —— 「Tools Deck」：
 * - 顶部命令面板：标题 + 一键复制 MCP 配置（两种格式）
 * - 11 个 MCP 工具按 monospace man-page 行展开
 * - 底部 ai_audit_logs 活动日志
 *
 * 不再提供「AI 自动生成草稿」界面（ 阶段二起用户改为本地更新）。
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminApi } from '../lib/admin-api';

// ----------------------------------------------------------------------------
// MCP 工具清单（与 apps/api/src/routes/mcp.ts 一一对应）
// ----------------------------------------------------------------------------
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Tool = {
  method: Method;
  path: string;
  purpose: string;
  /** 用于「复制配置」中作为示例的命令片段 */
curl: string;
};

const TOOLS: Tool[] = [
  {
    method: 'GET',
    path: '/api/mcp/drafts',
    purpose: '列出草稿（按 status / source_type 过滤）',
    curl: "curl -H 'X-AI-API-Key: $KEY' '$BASE/api/mcp/drafts?status=draft'",
  },
  {
    method: 'GET',
    path: '/api/mcp/drafts/:id',
    purpose: '草稿详情（含 source_meta 解析）',
    curl: "curl -H 'X-AI-API-Key: $KEY' '$BASE/api/mcp/drafts/8'",
  },
  {
    method: 'POST',
    path: '/api/mcp/drafts',
    purpose: '手动创建草稿（不调 AI，管理员本地用）',
    curl: "curl -H 'X-AI-API-Key: $KEY' -H 'Content-Type: application/json' -d '{\"title\":\"…\",\"content\":\"…\"}' '$BASE/api/mcp/drafts'",
  },
  {
    method: 'POST',
    path: '/api/mcp/drafts/:id/review',
    purpose: '审核草稿（publish / reject / request_revision）',
    curl: "curl -X PATCH -H 'X-AI-API-Key: $KEY' -H 'Content-Type: application/json' -d '{\"action\":\"publish\"}' '$BASE/api/mcp/drafts/8/review'",
  },
  {
    method: 'GET',
    path: '/api/mcp/posts',
    purpose: '已发布文章列表',
    curl: "curl -H 'X-AI-API-Key: $KEY' '$BASE/api/mcp/posts?status=published'",
  },
  {
    method: 'PATCH',
    path: '/api/mcp/posts/:id',
    purpose: '编辑已发布文章（content 变更落版本历史）',
    curl: "curl -X PATCH -H 'X-AI-API-Key: $KEY' -H 'Content-Type: application/json' -d '{\"title\":\"…\"}' '$BASE/api/mcp/posts/8'",
  },
  {
    method: 'GET',
    path: '/api/mcp/comments',
    purpose: '列评论（按 status 过滤）',
    curl: "curl -H 'X-AI-API-Key: $KEY' '$BASE/api/mcp/comments?status=pending'",
  },
  {
    method: 'POST',
    path: '/api/mcp/comments/:id/moderate',
    purpose: '审核评论（approve / reject / spam）',
    curl: "curl -X PATCH -H 'X-AI-API-Key: $KEY' -H 'Content-Type: application/json' -d '{\"action\":\"approve\"}' '$BASE/api/mcp/comments/12/moderate'",
  },
  {
    method: 'GET',
    path: '/api/mcp/analytics',
    purpose: '仪表盘聚合（PV / 文章数 / 待审 / Top 5）',
    curl: "curl -H 'X-AI-API-Key: $KEY' '$BASE/api/mcp/analytics'",
  },
  {
    method: 'POST',
    path: '/api/mcp/search/rebuild',
    purpose: '重建 FTS5 索引（posts_fts + vibe_fts）',
    curl: "curl -X POST -H 'X-AI-API-Key: $KEY' '$BASE/api/mcp/search/rebuild'",
  },
  {
    method: 'GET',
    path: '/health',
    purpose: 'API 健康检查（无需鉴权）',
    curl: "curl '$BASE/health'",
  },
];

const METHOD_COLOR: Record<Method, string> = {
  GET: 'text-emerald-400',
  POST: 'text-violet-400',
  PATCH: 'text-amber-400',
  DELETE: 'text-red-400',
};

// ----------------------------------------------------------------------------
// 主组件
// ----------------------------------------------------------------------------
export function McpConsole() {
  const [logs, setLogs] = useState<any[]>([]);
  const [showCopy, setShowCopy] = useState(false);
  const [copyFormat, setCopyFormat] = useState<'json' | 'env' | 'curl'>('json');
  const [copied, setCopied] = useState(false);

  const loadLogs = async () => {
    try {
      const l = await adminApi.auditLogs(100);
      setLogs(l);
    } catch {}
  };

  useEffect(() => {
    loadLogs();
    const t = setInterval(loadLogs, 15_000); // 15s 自动刷新
    return () => clearInterval(t);
  }, []);

  const apiKey = import.meta.env.PUBLIC_AI_API_KEY ?? '';

  const buildConfig = (): string => {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787';
    if (copyFormat === 'json') {
      return JSON.stringify(
        {
          mcpServers: {
            myblog: {
              command: 'npx',
              args: ['-y', '@myblog/mcp-operator'],
              env: {
                BLOG_API_BASE_URL: base,
                BLOG_AI_API_KEY: apiKey || '<your-ai-api-key>',
              },
            },
          },
        },
        null,
        2
      );
    }
    if (copyFormat === 'env') {
      return `# MyBlog MCP Operator 配置（写入 mcp/blog-operator/.env）\nBLOG_API_BASE_URL=${base}\nBLOG_AI_API_KEY=${apiKey || '<your-ai-api-key>'}`;
    }
    // curl
    return TOOLS.slice(0, 3)
      .map((t) => `# ${t.purpose}\n${t.curl.replace('$BASE', base).replace('$KEY', apiKey || '<your-ai-api-key>')}`)
      .join('\n\n');
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(buildConfig());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // 退化方案
      const ta = document.createElement('textarea');
      ta.value = buildConfig();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="space-y-8">
      {/* ============ 顶部命令面板 ============ */}
      <section className="card-elev relative overflow-hidden p-7 md:p-9">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 10%, rgba(124,58,237,0.15), transparent 50%), radial-gradient(circle at 85% 80%, rgba(232,121,249,0.08), transparent 50%)',
          }}
        />
        <div className="relative">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              AI Operator · MCP
            </span>
          </div>
          <h1 className="font-display text-3xl font-medium italic tracking-tight text-ink md:text-4xl">
            MCP 控制台
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-400">
            外部 AI agent 通过 <span className="font-mono text-ink-300">/api/mcp/*</span> 与博客交互。
            使用 <span className="font-mono text-ink-300">X-AI-API-Key</span> header 鉴权，与管理员
            session 隔离。下面是全部 11 个工具 + 当前活动日志。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowCopy(true)}
              className="btn btn-primary group relative inline-flex items-center gap-2"
            >
              <span className="text-base leading-none">⎘</span>
              复制 MCP 配置
            </button>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
              {apiKey ? '✓ 已填入真实 API Key' : '⚠️  PUBLIC_AI_API_KEY 未注入（运行时为占位）'}
            </span>
          </div>
        </div>
      </section>

      {/* ============ 工具清单 ============ */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="font-display text-base font-medium tracking-tight">工具清单</h2>
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
            {TOOLS.length} endpoints · POST/GET/PATCH
          </span>
        </div>
        <ul className="divide-y divide-white/5">
          {TOOLS.map((t, i) => (
            <ToolRow key={i} tool={t} />
          ))}
        </ul>
      </section>

      {/* ============ 活动日志 ============ */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="font-display text-base font-medium tracking-tight">活动日志</h2>
          <button
            onClick={loadLogs}
            className="font-mono text-[10px] uppercase tracking-wider text-ink-400 transition-colors hover:text-ink"
          >
            ↻ 刷新
          </button>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-ink-900/95 text-left font-mono text-[10px] uppercase tracking-wider text-ink-500 backdrop-blur">
              <tr>
                <th className="px-4 py-2">接口</th>
                <th className="px-4 py-2">方法</th>
                <th className="px-4 py-2">状态</th>
                <th className="px-4 py-2">耗时</th>
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                    暂无活动
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="max-w-md truncate px-4 py-2 font-mono text-ink-300">
                    {l.endpoint}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    <span
                      className={`badge !py-0.5 ${
                        l.method === 'GET'
                          ? '!text-emerald-400'
                          : l.method === 'POST'
                          ? '!text-violet-400'
                          : '!text-amber-400'
                      }`}
                    >
                      {l.method}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono">
                    <span
                      className={
                        l.responseStatus >= 200 && l.responseStatus < 300
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }
                    >
                      {l.responseStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-ink-400">{l.latencyMs}ms</td>
                  <td className="px-4 py-2 font-mono text-ink-500">{l.ipAddress ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-ink-500">
                    {new Date(l.createdAt).toLocaleTimeString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ 复制配置 Modal ============ */}
      <AnimatePresence>
        {showCopy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCopy(false)}
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="card-elev relative w-full max-w-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <h3 className="font-display text-lg font-medium italic tracking-tight">
                  MCP 配置
                </h3>
                <button
                  onClick={() => setShowCopy(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-400 hover:bg-white/5"
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-1 border-b border-white/5 px-5 py-2">
                {(['json', 'env', 'curl'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setCopyFormat(f)}
                    className={`rounded-md px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                      copyFormat === f
                        ? 'bg-violet-500/20 text-violet-200'
                        : 'text-ink-400 hover:bg-white/5'
                    }`}
                  >
                    {f === 'json' ? 'Claude Desktop' : f === 'env' ? '.env' : 'curl 示例'}
                  </button>
                ))}
              </div>

              <pre className="max-h-[400px] overflow-auto bg-black/30 p-5 font-mono text-[11px] leading-relaxed text-ink-200">
                {buildConfig()}
              </pre>

              <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
                <button
                  onClick={() => setShowCopy(false)}
                  className="btn !bg-white/5 !text-ink-300 hover:!bg-white/10"
                >
                  关闭
                </button>
                <button onClick={copyToClipboard} className="btn btn-primary">
                  {copied ? '✓ 已复制' : '⎘ 复制到剪贴板'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 单条工具行
// ----------------------------------------------------------------------------
function ToolRow({ tool }: { tool: Tool }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className={`w-14 shrink-0 font-mono text-[10px] uppercase tracking-wider ${METHOD_COLOR[tool.method]}`}>
          {tool.method}
        </span>
        <span className="flex-1 truncate font-mono text-xs text-ink-200">{tool.path}</span>
        <span className="hidden flex-1 text-xs text-ink-400 md:block">{tool.purpose}</span>
        <span className="font-mono text-[10px] text-ink-500">{open ? '▾' : '▸'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/5 bg-black/20"
          >
            <div className="space-y-2 px-5 py-3">
              <p className="text-xs text-ink-300 md:hidden">{tool.purpose}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-500">示例</p>
              <pre className="overflow-x-auto rounded border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-ink-300">
                {tool.curl.replace('$BASE', '<your-blog-domain>').replace('$KEY', '<your-ai-api-key>')}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default McpConsole;