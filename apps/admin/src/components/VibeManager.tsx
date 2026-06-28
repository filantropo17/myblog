/**
 * Vibe 笔记列表 + 「新建 / 编辑」跳转到 VibeEditor。
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';
import { moodLabel, VIBE_STATUS_LABEL } from '../lib/labels';

interface Props {
  onCreate: () => void;
  onEdit: (id: number) => void;
}

export function VibeManager({ onCreate, onEdit }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminApi.vibeAll();
      setItems(r ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const del = async (id: number) => {
    if (!confirm('确认删除？')) return;
    await adminApi.vibeDelete(id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Vibe 笔记</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-400">
            共 {items.length} 条
          </p>
        </div>
        <button onClick={onCreate} className="btn btn-primary">
          + 新建 Vibe
        </button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-ink-500">加载中…</p>
      ) : items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-ink-500">
            还没有 Vibe 笔记
          </p>
          <button onClick={onCreate} className="btn btn-primary mt-4">
            + 写一条
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              onClick={() => onEdit(n.id)}
              className="group flex cursor-pointer items-start gap-3 rounded-lg border border-ink-800 bg-ink-900/30 p-4 transition-colors hover:border-ink-600 hover:bg-ink-900/60"
            >
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-700 font-mono text-xs">
                {n.pinned ? '✦' : '·'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink-100">{n.title || n.content?.slice(0, 30)}</p>
                {n.title && n.content && n.content !== n.title && (
                  <p className="mt-1 line-clamp-2 text-xs text-ink-400">{n.content}</p>
                )}
                <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-ink-500">
                  <span>#{n.id}</span>
                  <span>·</span>
                  <span>{moodLabel(n.mood)}</span>
                  <span>·</span>
                  <span>{VIBE_STATUS_LABEL[n.status] ?? n.status}</span>
                  <span>·</span>
                  <span>♥ {n.likeCount ?? 0}</span>
                  <span>·</span>
                  <span>{new Date(n.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(n.id); }}
                  className="rounded border border-ink-700 px-2 py-1 text-[10px] hover:border-accent"
                >
                  编辑
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); del(n.id); }}
                  className="rounded border border-red-900/50 px-2 py-1 text-[10px] text-red-300 hover:border-red-500"
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
