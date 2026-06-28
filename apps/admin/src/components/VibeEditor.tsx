/**
 * Vibe 笔记编辑页（/admin/vibe/:id/edit 路由）。
 *
 * 字段：标题 / Markdown 正文 / mood / pinned / status。
 * 通过 hash 路由在 SPA 内挂载。
 */
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../lib/admin-api';
import { MarkdownEditor } from './MarkdownEditor';
import { VIBE_MOOD_LABEL, VIBE_STATUS_LABEL } from '../lib/labels';

const MOODS = [
  { value: 'happy', glyph: '✿' },
  { value: 'think', glyph: '◌' },
  { value: 'angry', glyph: '⚡' },
  { value: 'tired', glyph: '☽' },
  { value: 'inspired', glyph: '✦' },
  { value: 'chill', glyph: '◯' },
];

const STATUS_OPTIONS = [
  { value: 'draft' as const },
  { value: 'published' as const },
  { value: 'hidden' as const },
];

interface Props {
  vibeId: number | null;
  onBack: () => void;
  onSaved: () => void;
}

export function VibeEditor({ vibeId, onBack, onSaved }: Props) {
  const [loading, setLoading] = useState(vibeId !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('chill');
  const [pinned, setPinned] = useState(false);
  const [status, setStatus] = useState<'draft' | 'published' | 'hidden'>('published');

  const load = useCallback(async () => {
    if (vibeId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await adminApi.vibeAll();
      const n = list.find((x: any) => x.id === vibeId);
      if (!n) {
        setError(`找不到 Vibe #${vibeId}`);
        return;
      }
      setTitle(n.title ?? '');
      setContent(n.content ?? '');
      setMood(n.mood ?? 'chill');
      setPinned(!!n.pinned);
      setStatus(n.status ?? 'published');
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [vibeId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!content.trim()) {
      setError('请填写正文');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (vibeId === null) {
        await adminApi.vibeCreate({
          title: title.trim() || undefined,
          content,
          mood: mood as any,
          pinned,
          status: status as any,
        });
      } else {
        await adminApi.vibeUpdate(vibeId, {
          title: title.trim() || undefined,
          content,
          mood: mood as any,
          pinned,
          status: status as any,
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-wider text-ink-500">
        加载 Vibe…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 bg-ink-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded border border-ink-700 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-ink-300 hover:border-ink-500"
          >
            ← 返回列表
          </button>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
              {vibeId === null ? 'NEW VIBE' : `EDIT VIBE · #${vibeId}`}
            </p>
            <h1 className="font-display text-xl font-medium tracking-tight">
              {title || (vibeId === null ? '新 Vibe' : `Vibe #${vibeId}`)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !content.trim()}
            className="rounded bg-accent px-4 py-1.5 font-mono text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 font-mono text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Field label="标题（留空自动从正文取前 30 字）">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="可选"
              className="input"
              maxLength={120}
            />
          </Field>

          <Field label="正文 (Markdown)" required>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="现在脑子里在想什么…"
              minHeight={420}
            />
          </Field>
        </div>

        <aside className="space-y-5">
          <Section title="状态">
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value as any)}
                  className={`flex-1 rounded border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                    status === s.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-ink-700 text-ink-400 hover:border-ink-500'
                  }`}
                >
                  {VIBE_STATUS_LABEL[s.value] ?? s.value}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Mood">
            <div className="grid grid-cols-3 gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
                  className={`rounded border px-3 py-2 font-mono text-xs transition-colors ${
                    mood === m.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-ink-700 text-ink-400 hover:border-ink-500'
                  }`}
                >
                  <div className="text-base">{m.glyph}</div>
                  <div className="mt-0.5">{VIBE_MOOD_LABEL[m.value] ?? m.value}</div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="其他">
            <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-ink-300">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <span>置顶（钉在 Vibe 列表顶部）</span>
            </label>
          </Section>
        </aside>
      </div>
    </div>
  );
}

// ----- helpers -----
function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-400">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </div>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-800 bg-ink-900/40 p-4">
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-ink-500">
        {title}
      </h3>
      {children}
    </section>
  );
}
