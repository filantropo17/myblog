/**
 * 评论审核（/admin/comments 路由）。
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';
import { COMMENT_STATUS_LABEL, commentStatusLabel } from '../lib/labels';

export function CommentModerator() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'spam' | 'rejected'>('pending');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminApi.commentsList(tab);
      setItems(r ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab]);

  const moderate = async (id: number, action: 'approve' | 'spam' | 'reject') => {
    await adminApi.commentModerate(id, action);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('确认删除？')) return;
    await adminApi.commentDelete(id);
    load();
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">评论审核</h2>
      </header>

      <div className="flex gap-2 border-b border-ink-800">
        {(['pending', 'approved', 'spam', 'rejected'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? 'border-accent text-ink-100'
                : 'border-transparent text-ink-500 hover:text-ink-300'
            }`}
          >
            {COMMENT_STATUS_LABEL[t] ?? t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-500">没有 {commentStatusLabel(tab)} 的评论。</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-lg border border-ink-800 bg-ink-900/30 p-4">
              <header className="mb-2 flex items-center gap-2 text-xs">
                <span className="font-medium text-ink-200">{c.authorName}</span>
                {c.authorRole && (
                  <span className="rounded-full border border-accent px-2 py-0.5 font-mono text-[10px] text-accent">
                    {c.authorRole}
                  </span>
                )}
                <span className="text-ink-500">·</span>
                <span className="text-ink-500">
                  {c.targetType} #{c.targetId}
                </span>
                <span className="ml-auto font-mono text-[10px] text-ink-500">
                  {new Date(c.createdAt).toLocaleString('zh-CN')}
                </span>
              </header>
              <p className="text-sm text-ink-100">{c.content}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {tab !== 'approved' && (
                  <button
                    onClick={() => moderate(c.id, 'approve')}
                    className="rounded bg-emerald-700/40 px-3 py-1 text-emerald-200 hover:bg-emerald-700/60"
                  >
                    ✓ 批准
                  </button>
                )}
                {tab !== 'spam' && (
                  <button
                    onClick={() => moderate(c.id, 'spam')}
                    className="rounded border border-amber-700/50 px-3 py-1 text-amber-200 hover:border-amber-500"
                  >
                    ⚠ 垃圾
                  </button>
                )}
                {tab !== 'rejected' && (
                  <button
                    onClick={() => moderate(c.id, 'reject')}
                    className="rounded border border-ink-700 px-3 py-1 text-ink-300 hover:border-ink-500"
                  >
                    拒绝
                  </button>
                )}
                <button
                  onClick={() => remove(c.id)}
                  className="rounded border border-red-900/40 px-3 py-1 text-red-300 hover:border-red-500"
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