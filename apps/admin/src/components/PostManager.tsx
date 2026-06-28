/**
 * 文章管理 —— 列表 + 「新建 / 编辑」跳转到 PostEditor。
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';

const STATUS_LABELS: Record<string, string> = {
  published: '已发布',
  draft: '草稿',
  rejected: '已拒绝',
};

const CATEGORY_LABELS: Record<string, string> = {
  tech: '技术',
  project: '项目',
  diary: '随笔',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  outline: '大纲',
  github: 'GitHub',
  trending: '热点',
};

interface Props {
  onCreate: () => void;
  onEdit: (id: number) => void;
}

export function PostManager({ onCreate, onEdit }: Props) {
  const [posts, setPosts] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const all = await adminApi.listPosts();
    setPosts(all);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = posts.filter((p) => {
    if (status && p.status !== status) return false;
    if (filter && !p.title.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const togglePublish = async (p: any) => {
    await adminApi.updatePost(p.id, {
      status: p.status === 'published' ? 'draft' : 'published',
    });
    await load();
  };

  const remove = async (id: number, title: string) => {
    if (!confirm(`确定要删除「${title}」吗？此操作不可恢复。`)) return;
    await adminApi.deletePost(id);
    await load();
  };

  if (loading) return <div className="py-32 text-center text-ink-500">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">文章</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-400">
            共 {posts.length} 篇
          </p>
        </div>
        <button onClick={onCreate} className="btn btn-primary">
          + 新建文章
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
          <input
            className="input max-w-xs"
            placeholder="搜索标题…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input max-w-[160px]"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="rejected">已拒绝</option>
          </select>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-500">
            显示 {filtered.length} 条
          </span>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-white/5 bg-white/[0.02] text-left font-mono text-[10px] uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">分类</th>
              <th className="px-4 py-3">来源</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">日期</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((p) => (
              <tr key={p.id} className="cursor-pointer transition-colors hover:bg-white/[0.02]" onClick={() => onEdit(p.id)}>
                <td className="max-w-md truncate px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-400">
                  {CATEGORY_LABELS[p.category] ?? p.category ?? '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-400">
                  {SOURCE_LABELS[p.sourceType] ?? p.sourceType ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`badge !py-0.5 ${
                      p.status === 'published'
                        ? 'border-emerald-500/30 text-emerald-400'
                        : p.status === 'draft'
                          ? 'border-amber-500/30 text-amber-400'
                          : 'border-red-500/30 text-red-400'
                    }`}
                  >
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-400">
                  {new Date(p.publishedAt ?? p.createdAt).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onEdit(p.id)}
                    className="mr-1 font-mono text-xs text-accent transition-colors hover:text-accent/80"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => togglePublish(p)}
                    className="mr-1 font-mono text-xs text-ink-400 transition-colors hover:text-ink"
                  >
                    {p.status === 'published' ? '取消发布' : '发布'}
                  </button>
                  <button
                    onClick={() => remove(p.id, p.title)}
                    className="font-mono text-xs text-red-400 transition-colors hover:text-red-300"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-12 text-center">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-500">
              {posts.length === 0 ? '还没有任何文章' : '没有符合筛选条件的文章'}
            </p>
            {posts.length === 0 && (
              <button onClick={onCreate} className="btn btn-primary mt-4">
                + 新建第一篇
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
