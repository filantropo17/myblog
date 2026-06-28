import { useEffect, useState, useRef } from 'react';

interface Result {
  type: 'post' | 'vibe';
  id: number;
  slug?: string;
  title: string;
  excerpt?: string;
  mood?: string;
}

export default function CommandPalette({ apiBase }: { apiBase: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl + K 唤起
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // 打开时聚焦输入
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ('');
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // 搜索（300ms debounce）
  useEffect(() => {
    if (!q.trim() || q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`${apiBase}/api/v1/search?q=${encodeURIComponent(q)}&limit=8`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setResults(j?.data?.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, apiBase]);

  const goto = (r: Result) => {
    const url = r.type === 'post' ? `/posts/${r.slug}` : `/vibe/${r.id}`;
    setOpen(false);
    window.location.href = url;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      goto(results[active]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--ink-mute)]">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索文章 / Vibe …"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-[var(--ink-mute)]"
          />
          <kbd className="font-mono text-[10px] text-[var(--ink-mute)]">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <p className="px-4 py-8 text-center text-sm text-[var(--ink-mute)]">搜索中…</p>
          )}
          {!loading && q.length >= 2 && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-[var(--ink-mute)]">没有匹配的结果</p>
          )}
          {!loading && q.length < 2 && (
            <p className="px-4 py-8 text-center text-sm text-[var(--ink-mute)]">
              输入至少 2 个字符开始搜索
            </p>
          )}
          <ul>
            {results.map((r, i) => (
              <li key={`${r.type}-${r.id}`}>
                <button
                  onClick={() => goto(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors ${
                    active === i
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-transparent hover:bg-[var(--bg-soft)]'
                  }`}
                >
                  <span className="mt-1 inline-flex h-5 items-center rounded-full border border-[var(--border)] px-2 font-mono text-[10px] uppercase text-[var(--ink-mute)]">
                    {r.type === 'post' ? '文章' : 'Vibe'}
                  </span>
                  <span className="flex-1 truncate text-sm text-[var(--ink)]">
                    <span dangerouslySetInnerHTML={{ __html: r.title }} />
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mt-1 text-[var(--ink-mute)]">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 font-mono text-[10px] text-[var(--ink-mute)]">
          <span>↑↓ 选择 · ↵ 打开</span>
          <a href={`/search?q=${encodeURIComponent(q)}`} className="hover:text-[var(--accent)]">
            高级搜索 →
          </a>
        </footer>
      </div>
    </div>
  );
}