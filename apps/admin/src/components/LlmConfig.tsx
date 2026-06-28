/**
 * 对话 AI 管理。
 *
 * 视觉概念 —— 「Switchboard」（实验室配电板）：
 * - 顶部大物理 toggle（OFF = mock 模板 / ON = 真实 LLM），弹簧动画 + LED
 * - 4 个 input 网格（Base URL / API Key / Model / Timeout）
 * - 底部 action bar：保存 / 测试连接（真实验证 + 延迟显示）
 * - 底部 ai_audit_logs 活动日志（同 McpConsole）
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { adminApi } from '../lib/admin-api';

type Source = 'settings' | 'env';

interface LlmConfigData {
  enabled: boolean;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms: number;
  source: Record<'baseUrl' | 'apiKey' | 'model' | 'timeoutMs', Source> | null;
  active: boolean;
}

export function LlmConfig() {
  const [data, setData] = useState<LlmConfigData | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    base_url: '',
    api_key: '',
    model: '',
    timeout_ms: 30000,
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latency_ms?: number;
    error?: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 初次加载 + 定期刷新
  const loadAll = async () => {
    try {
      const [cfg, l] = await Promise.all([adminApi.llmConfigGet(), adminApi.auditLogs(50)]);
      setData(cfg);
      setForm({
        enabled: cfg.enabled,
        base_url: cfg.base_url,
        api_key: cfg.api_key,
        model: cfg.model,
        timeout_ms: cfg.timeout_ms,
      });
      // 只保留 ai-config 相关日志
      setLogs(
        (l as any[]).filter(
          (x) =>
            x.endpoint?.includes('/llm-config') ||
            x.endpoint?.includes('/api/v1/chat')
        )
      );
    } catch (e: any) {
      setToast(`加载失败：${e?.message ?? e}`);
    }
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 15_000);
    return () => clearInterval(t);
  }, []);

  const save = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      await adminApi.llmConfigSave(form);
      setToast('✓ 已保存并立即生效（chat 会话已重置 LLM 缓存）');
      await loadAll();
    } catch (e: any) {
      setToast(`保存失败：${e?.message ?? e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await adminApi.llmConfigTest();
      if (r.ok) {
        setTestResult({ ok: true, latency_ms: r.latency_ms });
      } else {
        setTestResult({ ok: false, error: (r as any).error ?? '失败' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message ?? String(e) });
    } finally {
      setTesting(false);
      await loadAll();
    }
  };

  return (
    <div className="space-y-8">
      {/* ============ 顶部标题 + Toggle ============ */}
      <section className="card-elev relative overflow-hidden p-7 md:p-9">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 20%, rgba(124,58,237,0.18), transparent 50%), radial-gradient(circle at 15% 75%, rgba(34,197,94,0.06), transparent 50%)',
          }}
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  form.enabled ? 'animate-pulse bg-emerald-400' : 'bg-ink-500'
                }`}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
                Chat AI · Switchboard
              </span>
            </div>
            <h1 className="font-display text-3xl font-medium italic tracking-tight text-ink md:text-4xl">
              对话 AI 管理
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-400">
              站内 AI 助手的开关 + 配置。关闭时降级为基于 FTS5
              检索的模板回答；开启时把检索片段发给配置的 OpenAI 兼容 endpoint。
            </p>
          </div>

          {/* 物理开关 */}
          <SwitchToggle
            on={form.enabled}
            onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          />
        </div>
      </section>

      {/* ============ 配置网格 ============ */}
      <section className="card p-6 md:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-base font-medium tracking-tight">参数配置</h2>
          {data?.source && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
              生效值来源 ·{' '}
              <span className="text-ink-300">
                {Object.entries(data.source)
                  .filter(([, v]) => v === 'settings')
                  .map(([k]) => k)
                  .join(', ') || 'all env'}
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label="Base URL"
            hint="OpenAI 兼容 endpoint 的根地址（不含 /chat/completions）"
          >
            <input
              className="input"
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>

          <Field label="Model" hint="模型标识，如 gpt-4o-mini / deepseek-chat">
            <input
              className="input"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </Field>

          <Field label="API Key" hint="完整写入，仅管理员可见">
            <input
              className="input font-mono"
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder="sk-..."
            />
          </Field>

          <Field label="Timeout (ms)" hint="单次 chat completion 超时，1s - 5min">
            <input
              className="input font-mono"
              type="number"
              min={1000}
              max={300_000}
              step={1000}
              value={form.timeout_ms}
              onChange={(e) =>
                setForm({ ...form, timeout_ms: Number(e.target.value) || 30_000 })
              }
            />
          </Field>
        </div>

        {/* Action bar */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/5 pt-5">
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button onClick={test} disabled={testing} className="btn btn-secondary">
            {testing ? (
              <>
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                测试中…
              </>
            ) : (
              '↯ 测试连接'
            )}
          </button>

          {/* Test 反馈 LED */}
          {testResult && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-xs ${
                testResult.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  testResult.ok ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
              {testResult.ok ? (
                <>
                  连接成功 · {testResult.latency_ms}ms
                </>
              ) : (
                <>{testResult.error}</>
              )}
            </motion.div>
          )}

          {data?.active ? (
            <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              当前活动
            </span>
          ) : (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-500">
              未配置（chat 走模板降级）
            </span>
          )}
        </div>

        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-ink-200"
          >
            {toast}
          </motion.div>
        )}
      </section>

      {/* ============ 活动日志 ============ */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 className="font-display text-base font-medium tracking-tight">活动日志</h2>
          <button
            onClick={loadAll}
            className="font-mono text-[10px] uppercase tracking-wider text-ink-400 transition-colors hover:text-ink"
          >
            ↻ 刷新
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-ink-900/95 text-left font-mono text-[10px] uppercase tracking-wider text-ink-500 backdrop-blur">
              <tr>
                <th className="px-4 py-2">接口</th>
                <th className="px-4 py-2">方法</th>
                <th className="px-4 py-2">状态</th>
                <th className="px-4 py-2">耗时</th>
                <th className="px-4 py-2">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-500">
                    暂无 LLM 相关活动
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
                  <td className="px-4 py-2 font-mono text-ink-500">
                    {new Date(l.createdAt).toLocaleTimeString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 物理开关
// ----------------------------------------------------------------------------
function SwitchToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="group relative flex items-center gap-4 rounded-xl border px-5 py-3 transition-colors"
      style={{
        borderColor: on ? 'rgba(34,197,94,0.3)' : 'var(--admin-border-strong)',
        background: on ? 'rgba(34,197,94,0.05)' : 'var(--admin-bg-soft)',
      }}
      aria-label={on ? '关闭 LLM' : '开启 LLM'}
    >
      {/* LED */}
      <div className="relative">
        <span
          className={`absolute -top-1 -right-1 h-2 w-2 rounded-full transition-all ${
            on ? 'bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-ink-500'
          }`}
        />
        <div
          className={`flex h-12 w-24 items-center rounded-full border p-1 transition-colors ${
            on ? 'border-emerald-500/40 bg-emerald-950/40' : 'border-white/10 bg-black/40'
          }`}
        >
          <motion.div
            animate={{ x: on ? 48 : 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className={`h-10 w-10 rounded-full shadow-md transition-colors ${
              on
                ? 'bg-gradient-to-br from-emerald-300 to-emerald-500'
                : 'bg-gradient-to-br from-ink-400 to-ink-500'
            }`}
          />
        </div>
      </div>

      <div className="text-left">
        <div
          className={`font-display text-lg font-medium italic ${
            on ? 'text-emerald-300' : 'text-ink-300'
          }`}
        >
          {on ? '真实 LLM' : '模拟 / 模板'}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
          {on ? 'enabled · real chat' : 'disabled · fallback template'}
        </div>
      </div>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Field 包装
// ----------------------------------------------------------------------------
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-400">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 font-mono text-[10px] text-ink-500">{hint}</p>}
    </div>
  );
}

export default LlmConfig;