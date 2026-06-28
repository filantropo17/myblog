import { useEffect, useState } from 'react';

interface Props {
  targetType: 'post' | 'vibe' | 'comment';
  targetId: number;
  apiBase: string;
  initialCount?: number;
  initialLiked?: boolean;
}

const STORAGE_KEY = (type: string, id: number) => `like:${type}:${id}`;

export default function LikeButton({
  targetType,
  targetId,
  apiBase,
  initialCount = 0,
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // 从 localStorage 读取是否已赞（粗略去重，游客场景）
    try {
      const v = localStorage.getItem(STORAGE_KEY(targetType, targetId));
      if (v === '1') setLiked(true);
    } catch {
      // 忽略
    }
    // 拉取最新 count
    fetch(`${apiBase}/api/v1/reactions/${targetType}/${targetId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data) setCount(j.data.like ?? 0);
      })
      .catch(() => {});
  }, [apiBase, targetType, targetId]);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    // 乐观更新
    setLiked((v) => !v);
    setCount((c) => (liked ? Math.max(0, c - 1) : c + 1));
    try {
      const res = await fetch(`${apiBase}/api/v1/reactions/${targetType}/${targetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reaction: 'like' }),
      });
      const j = await res.json();
      if (j.ok) {
        setLiked(j.data.liked);
        setCount(j.data.count);
        try {
          localStorage.setItem(STORAGE_KEY(targetType, targetId), j.data.liked ? '1' : '0');
        } catch {}
      } else {
        // 回滚
        setLiked((v) => !v);
        setCount((c) => (liked ? c + 1 : Math.max(0, c - 1)));
      }
    } catch {
      setLiked((v) => !v);
      setCount((c) => (liked ? c + 1 : Math.max(0, c - 1)));
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-all ${
        liked
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--border)] bg-[var(--bg-soft)] text-[var(--ink-mute)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
      }`}
      aria-pressed={liked}
      aria-label={liked ? '取消点赞' : '点赞'}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        className="transition-transform group-hover:scale-110"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span>{liked ? '已点赞' : '点赞'}</span>
      <span className="font-mono text-[10px] tabular-nums">{count}</span>
    </button>
  );
}