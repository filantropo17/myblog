/**
 * Newsletter 订阅组件。
 *
 * 提交 → POST /api/v1/subscribers
 * 收到 confirm_url（dev 模式降级返回） → 提示用户点击完成双确认
 * 任何错误 → 内联展示，不弹窗
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE =
  (typeof window !== 'undefined' && (window as any).PUBLIC_API_BASE) ||
  'http://localhost:8787';

type State = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'error';

export function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || state === 'submitting') return;

    setState('submitting');
    setMessage(null);
    setConfirmUrl(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/subscribers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, source: 'footer' }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState('error');
        setMessage(json.error ?? '提交失败，请稍后再试');
        return;
      }

      const data = json.data ?? {};
      // 已是 confirmed
      if (data.status === 'confirmed') {
        setState('confirmed');
        setMessage(data.message ?? '已订阅');
        return;
      }
      // 新订阅 / 复活：dev 降级会带 confirm_url
      setState('pending');
      setMessage(data.message ?? '请查收确认邮件');
      if (data.confirm_url) {
        setConfirmUrl(`${API_BASE}${data.confirm_url}`);
      }
    } catch (err: any) {
      setState('error');
      setMessage(err?.message ?? '网络错误');
    }
  };

  return (
    <div className="not-prose my-2 w-full max-w-md">
      <AnimatePresence mode="wait">
        {state === 'confirmed' ? (
          <motion.p
            key="confirmed"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-xs uppercase tracking-wider text-[var(--accent-2)]"
          >
            ✓ {message}
          </motion.p>
        ) : state === 'pending' && confirmUrl ? (
          <motion.div
            key="pending"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <p className="text-sm text-[var(--ink-mute)]">
              {message}（开发模式无 SMTP，点下方链接直接完成双确认）
            </p>
            <a
              href={confirmUrl}
              onClick={async (e) => {
                e.preventDefault();
                try {
                  const r = await fetch(confirmUrl, { credentials: 'include' });
                  const j = await r.json();
                  if (j.ok) {
                    setState('confirmed');
                    setMessage('订阅已确认');
                  }
                } catch {
                  setState('error');
                  setMessage('确认失败');
                }
              }}
              className="inline-block text-sm text-[var(--accent)] underline-offset-4 hover:underline"
            >
              → 完成确认
            </a>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={submit}
            className="flex w-full flex-col gap-2 sm:flex-row"
          >
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={state === 'submitting'}
              className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-mute)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={state === 'submitting' || !email}
              className="btn btn-primary shrink-0 disabled:opacity-50"
            >
              {state === 'submitting' ? '提交中…' : '订阅'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {state === 'error' && message && (
        <p className="mt-2 font-mono text-xs text-red-400">{message}</p>
      )}

      {state === 'pending' && !confirmUrl && message && (
        <p className="mt-2 text-xs text-[var(--ink-mute)]">{message}</p>
      )}
    </div>
  );
}

export default SubscribeForm;
