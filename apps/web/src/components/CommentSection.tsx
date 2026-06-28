import { useEffect, useState, useCallback } from 'react';

interface Comment {
  id: number;
  parentId: number | null;
  authorName: string;
  authorRole?: string | null;
  content: string;
  createdAt: string;
  replies: Comment[];
}

interface Props {
  targetType: 'post' | 'vibe';
  targetId: number;
  apiBase: string;
}

const MOOD = {
  happy: '✦',
  think: '◐',
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function renderContent(text: string) {
  // 轻量 Markdown：粗体 / 斜体 / 链接 / 代码
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 font-mono text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[var(--accent)] hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br/>');
  return { __html: html };
}

export default function CommentSection({ targetType, targetId, apiBase }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'pending' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/comments/${targetType}/${targetId}`);
      if (res.ok) {
        const json = await res.json();
        setComments(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase, targetType, targetId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          parent_id: replyTo,
          author_name: name,
          author_email: email || undefined,
          content,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({
          kind: json.data?.status === 'pending' ? 'pending' : 'success',
          text: json.data?._status_message ?? '已发布',
        });
        setContent('');
        setReplyTo(null);
        if (json.data?.status !== 'pending') load();
      } else {
        setMsg({ kind: 'error', text: json.error ?? '提交失败' });
      }
    } catch (err: any) {
      setMsg({ kind: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-16 border-t border-[var(--border)] pt-12">
      <header className="mb-8 flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-light tracking-tight md:text-3xl">
          评论 <span className="text-[var(--ink-mute)]">· {comments.length}</span>
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
          Comments
        </span>
      </header>

      {/* 表单 */}
      <form onSubmit={submit} className="mb-12 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="text"
            placeholder="昵称 *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)]"
          />
          <input
            type="email"
            placeholder="邮箱（不公开，仅用于 Gravatar）"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)]"
          />
        </div>
        {replyTo !== null && (
          <div className="flex items-center gap-2 text-xs text-[var(--ink-mute)]">
            <span>正在回复 #{replyTo}</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-[var(--accent)] hover:underline"
            >
              取消
            </button>
          </div>
        )}
        <textarea
          placeholder="说点什么…（支持 **粗体** *斜体* `代码` [链接](https://…)）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
          required
          rows={4}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--accent)]"
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--ink-mute)]">
            {content.length}/2000
          </span>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-[var(--accent)] px-6 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '提交中…' : '发布评论'}
          </button>
        </div>
        {msg && (
          <p
            className={`text-xs ${
              msg.kind === 'error'
                ? 'text-red-400'
                : msg.kind === 'pending'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            }`}
          >
            {msg.text}
          </p>
        )}
      </form>

      {/* 列表 */}
      {loading ? (
        <p className="text-sm text-[var(--ink-mute)]">加载中…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-[var(--ink-mute)]">还没有评论。来当第一个吧。</p>
      ) : (
        <ul className="space-y-6">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              depth={0}
              onReply={(id) => setReplyTo(id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  depth,
  onReply,
}: {
  comment: Comment;
  depth: number;
  onReply: (id: number) => void;
}) {
  const isAdmin = comment.authorRole === 'admin' || comment.authorRole === 'editor';
  return (
    <li className={depth > 0 ? 'ml-6 md:ml-12' : ''}>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/50 p-5 transition-colors hover:bg-[var(--bg-soft)]">
        <header className="mb-2 flex items-center gap-2 text-xs">
          <span className="font-medium text-[var(--ink)]">{comment.authorName}</span>
          {isAdmin && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">
              {comment.authorRole === 'admin' ? '👑 Admin' : '✦ Editor'}
            </span>
          )}
          <span className="text-[var(--ink-mute)]">·</span>
          <time className="font-mono text-[10px] text-[var(--ink-mute)]" dateTime={comment.createdAt}>
            {relTime(comment.createdAt)}
          </time>
        </header>
        <div
          className="text-sm leading-relaxed text-[var(--ink)]"
          dangerouslySetInnerHTML={renderContent(comment.content)}
        />
        <button
          onClick={() => onReply(comment.id)}
          className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)] transition-colors hover:text-[var(--accent)]"
        >
          ↩ 回复
        </button>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <ul className="mt-3 space-y-3">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} depth={depth + 1} onReply={onReply} />
          ))}
        </ul>
      )}
    </li>
  );
}