/**
 * 全屏 AI 对话（/chat 路由）。
 *
 * 布局：
 * - mobile：单栏，新会话按钮浮顶 + 消息流 + 输入区
 * - lg (≥1024)：左侧历史会话列（240px 固定）+ 右侧对话主区
 * 移动端仅调参：抽屉宽变 100%、字距自适应、安全区（env(safe-area-inset-bottom)）。
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { renderChatMarkdown } from '../lib/chat-markdown';
import { useSessionMessages, type ChatMessage as Message, type ChatSource as Source } from '../lib/use-session-messages';

type Session = { id: string; title: string | null; created_at: string };

export function ChatFullscreen({ apiBase }: { apiBase: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages, clearHistory, lastUserQuery] = useSessionMessages();
  /** 流式累积中：禁止 sessionId 切换 effect 用服务端数据覆盖本地 state */
const streamingRef = useRef(false);
  /** 挂载时是否已处理过 storage 恢复（避免重复建 session） */
const restoredRef = useRef(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSessions = async () => {
    try {
      const r = await fetch(`${apiBase}/api/v1/chat/sessions`, { credentials: 'include' });
      const j = await r.json();
      if (j.ok) setSessions(j.data ?? []);
    } catch {}
  };

  useEffect(() => { void loadSessions(); }, []);

  // 挂载时如果 storage 有恢复内容 → 立即建一个 server session 占位（让后续发问有去处）
  // messages 已由 useSessionMessages 从 storage 恢复，不需要额外操作
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem('myblog.chat.history');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
    } catch {
      return;
    }
    // 有恢复内容 → 建 server session（messages 已由 hook 恢复）
    void (async () => {
      const r = await fetch(`${apiBase}/api/v1/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (j.ok) {
        setSessionId(j.data.id);
        void loadSessions();
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      // 如果 storage 已经有恢复内容，挂载期间不要清掉（hook 会在下一个 microtask 把它写回 messages）
      if (restoredRef.current) {
        try {
          const raw = sessionStorage.getItem('myblog.chat.history');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return;
          }
        } catch {}
      }
      setMessages([]);
      return;
    }
    // 流式累积中：服务端的数据可能比本地落后（流式还没 persist），
    // 覆盖会把已收到的 token 抹掉。跳过本次同步。
    if (streamingRef.current) return;
    void (async () => {
      const r = await fetch(`${apiBase}/api/v1/chat/sessions/${sessionId}`, { credentials: 'include' });
      const j = await r.json();
      if (j.ok) setMessages(j.data.messages ?? []);
    })();
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const newSession = async () => {
    const r = await fetch(`${apiBase}/api/v1/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const j = await r.json();
    if (j.ok) {
      setSessionId(j.data.id);
      setMessages([]);
      void loadSessions();
    }
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    let sid = sessionId;
    if (!sid) {
      const r = await fetch(`${apiBase}/api/v1/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!j.ok) return;
      sid = j.data.id;
      setSessionId(sid);
      void loadSessions();
    }

    const userMsg: Message = { role: 'user', content: input };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setSending(true);

    const placeholderId = Date.now();
    setMessages((m) => [...m, { id: placeholderId, role: 'assistant', content: '', pending: true }]);
    streamingRef.current = true;

    try {
      const res = await fetch(`${apiBase}/api/v1/chat/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: userMsg.content }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accumulated = '';
      let sources: Source[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          let event = 'message';
          let data = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          if (event === 'sources') {
            try { sources = JSON.parse(data); } catch {}
          } else if (event === 'token') {
            try {
              const { delta } = JSON.parse(data);
              accumulated += delta;
              setMessages((m) =>
                m.map((x) => (x.id === placeholderId ? { ...x, content: accumulated } : x))
              );
            } catch {}
          } else if (event === 'done') {
            setMessages((m) =>
              m.map((x) => (x.id === placeholderId ? { ...x, pending: false, sources } : x))
            );
            void loadSessions();
          }
        }
      }
    } catch {
      setMessages((m) =>
        m.map((x) =>
          x.id === placeholderId ? { ...x, content: '（网络错误）', pending: false } : x
        )
      );
    } finally {
      streamingRef.current = false;
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div
      className="mx-auto flex w-full flex-col"
      style={{
        height: '100dvh',
        maxWidth: '1280px',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-3">
          <a href="/" className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)] hover:text-[var(--accent)]">
            ← 回到首页
          </a>
        </div>
        <div className="text-center">
          <h1 className="font-display text-lg font-medium md:text-xl">站内 AI 对话</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
            基于博客内容的检索式回答
          </p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="rounded border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              title="清空当前标签页的对话历史（关闭标签页也会自动失效）"
            >
              清空
            </button>
          )}
          <button
            onClick={newSession}
            className="btn btn-primary text-xs md:text-sm"
          >
            新会话
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* 左侧历史（仅 lg+） */}
        <aside className="hidden shrink-0 overflow-y-auto border-r border-[var(--border)] lg:block lg:w-64">
          <div className="p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">最近会话</p>
            <ul className="space-y-1">
              {sessions.length === 0 && (
                <li className="px-2 py-2 text-xs text-[var(--ink-mute)]">还没有会话</li>
              )}
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSessionId(s.id)}
                    className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      s.id === sessionId
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                        : 'hover:bg-[var(--ink-mute)]/5'
                    }`}
                    title={s.title ?? s.created_at}
                  >
                    {s.title ?? '新会话'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* 主区 */}
        <section className="flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-10">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <span className="text-4xl opacity-50" style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}>✦</span>
                <h2 className="font-display font-light" style={{ fontSize: 'clamp(1.4rem, 4vw, 2.4rem)' }}>
                  问我任何事
                </h2>
                <p className="max-w-md text-sm text-[var(--ink-mute)] md:text-base">
                  所有回答都会从博客已发布的文章和 Vibe 笔记里检索，最长 ~30 秒。
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['介绍下 Vibe Coding', 'Hono 框架怎么用', '推荐一篇阅读时间短的文章'].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--ink-mute)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {messages.map((m, i) => (
                  <Bubble
                    key={m.id ?? i}
                    m={m}
                    onResend={() => {
                      const q = lastUserQuery();
                      if (q) {
                        setInput(q);
                        setMessages((arr) => arr.filter((x) => !x.interrupted));
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <footer
            className="shrink-0 border-t border-[var(--border)] bg-[var(--bg)]/80 px-3 py-3 backdrop-blur md:px-6 md:py-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="输入问题…（Enter 发送）"
                disabled={sending}
                className="flex-1 resize-none rounded-md border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm leading-relaxed placeholder:text-[var(--ink-mute)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
                style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)', maxHeight: '8em' }}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="btn btn-primary shrink-0 disabled:opacity-50"
              >
                {sending ? '思考中…' : '发送'}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function Bubble({ m, onResend }: { m: Message; onResend?: () => void }) {
  const isUser = m.role === 'user';
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`max-w-[88%] rounded-2xl px-4 py-3 leading-relaxed md:max-w-[75%] ${
            isUser
              ? 'bg-[var(--accent)] text-white'
              : 'border border-[var(--border)] bg-[var(--ink-mute)]/5 text-[var(--ink)]'
          }`}
          style={{ fontSize: 'clamp(0.9rem, 2.3vw, 1rem)' }}
        >
          <MarkdownContent role={m.role} text={m.content} pending={m.pending} />
          {m.interrupted && onResend && (
            <div className="mt-3 flex items-center gap-2 border-t border-dashed border-[var(--accent)]/40 pt-2 text-xs text-[var(--ink-mute)]">
              <span>↳ 聊天中断</span>
              <button
                onClick={onResend}
                className="rounded border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                title="把上一条用户问题重新填到输入框，点发送重试"
              >
                点击重新生成 ↻
              </button>
            </div>
          )}
          {!isUser && !m.interrupted && m.sources && m.sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">
              {m.sources.map((s, i) => (
                <a
                  key={i}
                  href={
                    s.type === 'post' && s.slug
                      ? `/posts/${s.slug}`
                      : s.type === 'vibe'
                      ? `/vibe/${s.id}`
                      : '#'
                  }
                  target={s.type === 'post' ? '_blank' : undefined}
                  rel="noreferrer"
                  className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-0.5 font-mono text-[10px] text-[var(--accent)] hover:bg-[var(--accent)]/20"
                >
                  {s.type === 'post' ? `《${s.title ?? '文章'}》` : 'Vibe'} →
                </a>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default ChatFullscreen;

/** 气泡内容：用户消息纯文本，助手消息用 markdown 渲染（marked + DOMPurify） */
function MarkdownContent({ role, text, pending }: { role: 'user' | 'assistant' | 'system'; text: string; pending?: boolean }) {
  if (!text) {
    return <p className="opacity-60">{pending ? '正在思考…' : ''}</p>;
  }
  if (role === 'user') {
    return <p className="whitespace-pre-wrap break-words">{text}</p>;
  }
  const html = renderChatMarkdown(text);
  return (
    <div
      className="chat-markdown break-words [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_strong]:font-semibold [&_a]:underline [&_a]:text-[var(--accent)] [&_a:hover]:opacity-80 [&_code]:rounded [&_code]:bg-[var(--ink-mute)]/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}