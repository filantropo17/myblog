/**
 * 项目管理 —— 列表 + 「二级弹窗」编辑器。
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminApi } from '../lib/admin-api';

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  planned: '计划中',
  archived: '已归档',
};

const empty = () => ({
  id: null as number | null,
  name: '',
  description: '',
  techStack: [] as string[],
  githubUrl: '',
  demoUrl: '',
  status: 'active' as 'active' | 'archived' | 'planned',
  sortOrder: 0,
});

export function ProjectManager() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ReturnType<typeof empty> | null>(null);
  const [techInput, setTechInput] = useState('');

  const load = async () => {
    setLoading(true);
    const list = await adminApi.listProjects();
    setProjects(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(empty());
    setTechInput('');
  };

  const openEdit = (p: any) => {
    setEditing({
      id: p.id,
      name: p.name ?? '',
      description: p.description ?? '',
      techStack: Array.isArray(p.techStack) ? p.techStack : [],
      githubUrl: p.githubUrl ?? '',
      demoUrl: p.demoUrl ?? '',
      status: p.status ?? 'active',
      sortOrder: p.sortOrder ?? 0,
    });
    setTechInput('');
  };

  const closeModal = () => setEditing(null);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return;
    const payload = {
      name: editing.name,
      description: editing.description,
      tech_stack: editing.techStack,
      github_url: editing.githubUrl,
      demo_url: editing.demoUrl,
      status: editing.status,
      sort_order: editing.sortOrder,
    };
    if (editing.id === null) {
      await adminApi.createProject(payload);
    } else {
      await adminApi.updateProject(editing.id, payload);
    }
    closeModal();
    await load();
  };

  const remove = async (id: number, name: string) => {
    if (!confirm(`确定要删除项目「${name}」吗？此操作不可恢复。`)) return;
    await adminApi.deleteProject(id);
    await load();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...projects];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    const a = next[idx];
    const b = next[target];
    await adminApi.updateProject(a.id, { sort_order: b.sortOrder });
    await adminApi.updateProject(b.id, { sort_order: a.sortOrder });
    await load();
  };

  // ESC 关闭
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  if (loading) return <div className="py-32 text-center text-ink-500">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">项目</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-ink-400">
            共 {projects.length} 个
          </p>
        </div>
        <button onClick={openNew} className="btn btn-primary">
          + 新建项目
        </button>
      </div>

      <div className="card divide-y divide-white/5">
        {projects.map((p, idx) => (
          <div key={p.id} className="flex items-center gap-4 p-4">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label="上移"
                className="text-ink-500 hover:text-ink disabled:opacity-30"
              >
                ▲
              </button>
              <button
                onClick={() => move(idx, 1)}
                disabled={idx === projects.length - 1}
                aria-label="下移"
                className="text-ink-500 hover:text-ink disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <span
                  className={`badge !py-0.5 ${
                    p.status === 'active'
                      ? 'border-emerald-500/30 text-emerald-400'
                      : p.status === 'planned'
                        ? 'border-amber-500/30 text-amber-400'
                        : 'border-ink-500/30 text-ink-400'
                  }`}
                >
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-ink-400">{p.description}</p>
            </div>
            <div className="hidden gap-1 md:flex">
              {(p.techStack ?? []).slice(0, 4).map((t: string) => (
                <span
                  key={t}
                  className="rounded border border-white/5 bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-ink-400"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="flex gap-2 font-mono text-xs">
              <button onClick={() => openEdit(p)} className="text-accent hover:text-accent/80">
                编辑
              </button>
              <button onClick={() => remove(p.id, p.name)} className="text-red-400 hover:text-red-300">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 二级弹窗 */}
      <AnimatePresence>
        {editing && (
          <ProjectEditModal
            editing={editing}
            setEditing={setEditing}
            techInput={techInput}
            setTechInput={setTechInput}
            onClose={closeModal}
            onSave={save}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 真正的二级弹窗（覆盖层 + 居中 + ESC/点击外部关闭）
// ---------------------------------------------------------------------------

interface ModalProps {
  editing: ReturnType<typeof empty>;
  setEditing: (e: ReturnType<typeof empty>) => void;
  techInput: string;
  setTechInput: (s: string) => void;
  onClose: () => void;
  onSave: () => void;
}

function ProjectEditModal({ editing, setEditing, techInput, setTechInput, onClose, onSave }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />

      {/* panel */}
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 shadow-2xl"
        style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-ink-900/95 px-6 py-4 backdrop-blur">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
              {editing.id === null ? 'NEW PROJECT' : `EDIT PROJECT · #${editing.id}`}
            </p>
            <h2 className="font-display text-xl font-medium tracking-tight">
              {editing.name || (editing.id === null ? '新项目' : '编辑项目')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1.5 text-ink-400 hover:bg-white/5 hover:text-ink-200"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-5 p-6 md:grid-cols-2">
          <Field label="名称" required full>
            <input
              className="input"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              autoFocus
              placeholder="项目名称…"
            />
          </Field>

          <Field label="状态">
            <select
              className="input"
              value={editing.status}
              onChange={(e) => setEditing({ ...editing, status: e.target.value as any })}
            >
              <option value="active">进行中</option>
              <option value="planned">计划中</option>
              <option value="archived">已归档</option>
            </select>
          </Field>

          <Field label="简介" full>
            <textarea
              className="input"
              rows={3}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="一句话说清项目做什么…"
            />
          </Field>

          <Field label="GitHub 链接">
            <input
              className="input font-mono text-xs"
              value={editing.githubUrl}
              onChange={(e) => setEditing({ ...editing, githubUrl: e.target.value })}
              placeholder="https://github.com/…"
            />
          </Field>

          <Field label="Demo 链接">
            <input
              className="input font-mono text-xs"
              value={editing.demoUrl}
              onChange={(e) => setEditing({ ...editing, demoUrl: e.target.value })}
              placeholder="https://…"
            />
          </Field>

          <Field label="技术栈" full>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {editing.techStack.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({ ...editing, techStack: editing.techStack.filter((x) => x !== t) })
                    }
                    className="text-ink-400 hover:text-red-400"
                    aria-label={`移除 ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="添加技术栈…"
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && techInput.trim()) {
                    e.preventDefault();
                    setEditing({ ...editing, techStack: [...editing.techStack, techInput.trim()] });
                    setTechInput('');
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (techInput.trim()) {
                    setEditing({ ...editing, techStack: [...editing.techStack, techInput.trim()] });
                    setTechInput('');
                  }
                }}
                className="btn btn-secondary"
              >
                添加
              </button>
            </div>
          </Field>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-white/5 bg-ink-900/95 px-6 py-3 backdrop-blur">
          <button onClick={onClose} className="btn btn-secondary">
            取消
          </button>
          <button onClick={onSave} className="btn btn-primary" disabled={!editing.name.trim()}>
            {editing.id === null ? '创建' : '保存'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-ink-400">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </label>
      {children}
    </div>
  );
}
