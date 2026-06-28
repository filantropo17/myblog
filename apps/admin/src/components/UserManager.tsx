/**
 * 用户管理（/admin/users 路由）。
 */
import { useEffect, useState } from 'react';
import { adminApi } from '../lib/admin-api';

const ROLES = ['admin', 'editor', 'author', 'reader'] as const;

export function UserManager() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    email: '',
    username: '',
    password: '',
    display_name: '',
    role: 'reader' as string,
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminApi.usersList();
      setItems(r ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateRole = async (id: number, role: string) => {
    await adminApi.userUpdate(id, { role });
    load();
  };

  const updateStatus = async (id: number, status: string) => {
    await adminApi.userUpdate(id, { status });
    load();
  };

  const create = async () => {
    await adminApi.userCreate(draft);
    setCreating(false);
    setDraft({ email: '', username: '', password: '', display_name: '', role: 'reader' });
    load();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium">用户管理</h2>
        <button
          onClick={() => setCreating(!creating)}
          className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          {creating ? '取消' : '+ 新建用户'}
        </button>
      </header>

      {creating && (
        <section className="space-y-3 rounded-lg border border-ink-800 bg-ink-900/40 p-5">
          <input
            placeholder="邮箱"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            className="w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            placeholder="用户名"
            value={draft.username}
            onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            className="w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            placeholder="密码（≥ 8 字符）"
            value={draft.password}
            onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            className="w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            placeholder="显示名（可选）"
            value={draft.display_name}
            onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            className="w-full rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            className="rounded border border-ink-700 bg-ink-950 px-3 py-2 text-sm"
          >
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button
            onClick={create}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            创建
          </button>
        </section>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">加载中…</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-ink-800 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">邮箱</th>
              <th className="px-3 py-2 text-left">用户名</th>
              <th className="px-3 py-2 text-left">角色</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">注册时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-b border-ink-800/50">
                <td className="px-3 py-3 font-mono text-xs text-ink-500">{u.id}</td>
                <td className="px-3 py-3">{u.email}</td>
                <td className="px-3 py-3">{u.username}</td>
                <td className="px-3 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    className="rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select
                    value={u.status}
                    onChange={(e) => updateStatus(u.id, e.target.value)}
                    className="rounded border border-ink-700 bg-ink-950 px-2 py-1 text-xs"
                  >
                    {['active', 'suspended', 'deleted'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3 font-mono text-[10px] text-ink-500">
                  {new Date(u.created_at).toLocaleDateString('zh-CN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}