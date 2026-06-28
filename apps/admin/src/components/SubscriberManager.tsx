/**
 * 订阅者管理（/admin/subscribers 路由）。
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';

export function SubscriberManager() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminApi.subscribersList();
      setItems(r ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    const header = ['email', 'status', 'confirmed_at', 'created_at'];
    const rows = items.map((s) => [s.email, s.status, s.confirmedAt ?? '', s.createdAt]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (id: number) => {
    if (!confirm('确认删除订阅？')) return;
    await adminApi.subscriberDelete(id);
    load();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium">订阅者</h2>
        <div className="flex gap-2">
          <span className="font-mono text-xs text-ink-500">{items.length} 位</span>
          <button
            onClick={exportCSV}
            className="rounded border border-ink-700 px-3 py-1 text-xs hover:border-accent"
          >
            导出 CSV
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-ink-500">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-500">还没有订阅者。</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-ink-800 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">邮箱</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">确认时间</th>
              <th className="px-3 py-2 text-left">订阅时间</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-ink-800/50">
                <td className="px-3 py-3 font-mono text-xs text-ink-500">{s.id}</td>
                <td className="px-3 py-3">{s.email}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                      s.status === 'confirmed'
                        ? 'bg-emerald-700/30 text-emerald-200'
                        : s.status === 'pending'
                          ? 'bg-amber-700/30 text-amber-200'
                          : 'bg-ink-800 text-ink-500'
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-[10px] text-ink-500">
                  {s.confirmedAt ? new Date(s.confirmedAt).toLocaleString('zh-CN') : '—'}
                </td>
                <td className="px-3 py-3 font-mono text-[10px] text-ink-500">
                  {new Date(s.createdAt).toLocaleString('zh-CN')}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded border border-red-900/40 px-2 py-1 text-[10px] text-red-300 hover:border-red-500"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}