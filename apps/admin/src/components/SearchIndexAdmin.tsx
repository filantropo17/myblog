/**
 * 搜索索引管理（/admin/search-index 路由）。
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';

export function SearchIndexAdmin() {
  const [status, setStatus] = useState<any>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await adminApi.searchStatus();
      setStatus(r);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const rebuild = async () => {
    if (!confirm('重建索引会清空 FTS 表并重新填充，继续？')) return;
    setRebuilding(true);
    setMsg(null);
    try {
      await adminApi.searchRebuild();
      setMsg('✓ 索引已重建');
      load();
    } catch (e: any) {
      setMsg(`✗ ${e.message}`);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">搜索索引</h2>
        <p className="mt-1 font-mono text-xs text-ink-500">
          SQLite FTS5 全文索引 + 中文分词
        </p>
      </header>

      <section className="rounded-lg border border-ink-800 bg-ink-900/40 p-5">
        <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-ink-500">索引状态</h3>
        {status ? (
          <div className="space-y-3">
            <Row label="posts_fts 行数" value={status.ftsPosts} />
            <Row label="vibe_fts 行数" value={status.ftsVibe} />
            <Row label="posts 表总行数" value={status.postsTotal} />
            <Row label="vibe_notes 表总行数" value={status.vibeTotal} />
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status.inSync ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono text-xs">
                {status.inSync ? '索引已同步' : '索引与源表不一致，建议重建'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500">加载中…</p>
        )}
      </section>

      <section>
        <button
          onClick={rebuild}
          disabled={rebuilding}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {rebuilding ? '重建中…' : '重建 FTS 索引'}
        </button>
        {msg && (
          <p
            className={`mt-3 font-mono text-xs ${
              msg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {msg}
          </p>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-400">{label}</span>
      <span className="font-mono text-ink-100">{value}</span>
    </div>
  );
}