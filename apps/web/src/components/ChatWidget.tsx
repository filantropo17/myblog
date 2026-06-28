/**
 * 站内 AI 对话浮动窗。
 *
 *  - 默认右下角悬浮按钮（mobile 缩小到 14/16，圆角 50%）
 *  - 点击展开抽屉式对话窗口（mobile 直接占满视口）
 *  - 通过 EventSource（SSE）接收服务端流式 token
 *  - 顶部按钮可一键跳到 /chat 全屏页
 *
 * 移动端：clamp() 流体字号、抽屉满屏、按钮间距自适应；
 * 不动桌面端结构，只用媒体查询调参。
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { renderChatMarkdown } from '../lib/chat-markdown';
import { useSessionMessages, type ChatMessage as Message, type ChatSource as Source } from '../lib/use-session-messages';

const API_BASE =
  (typeof window !== 'undefined' && (window as any).PUBLIC_API_BASE) ||
  'http://localhost:8787';

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages, clearHistory, lastUserQuery] = useSessionMessages();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // /chat 全屏页有独立 UI，不重复挂浮动按钮
  if (typeof window !== 'undefined' && window.location.pathname === '/chat') {
    return null;
  }

  // 打开时如果没有 session 就创建
  useEffect(() => {
    if (!open || sessionId) return;
    void (async () => {
      const r = await fetch(`${API_BASE}/api/v1/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (j.ok) setSessionId(j.data.id);
    })();
  }, [open, sessionId]);

  // 自动滚到底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !sessionId || sending) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setSending(true);

    // 占位助手消息
    const placeholderId = Date.now();
    setMessages((m) => [...m, { id: placeholderId, role: 'assistant', content: '', pending: true }]);

    try {
      const res = await fetch(`${API_BASE}/api/v1/chat/sessions/${sessionId}/messages`, {
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
        // SSE 解析：event: ... \n data: ... \n\n
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const lines = part.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
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
          }
        }
      }
    } catch (e) {
      setMessages((m) =>
        m.map((x) =>
          x.id === placeholderId ? { ...x, content: '（网络错误，请稍后再试）', pending: false } : x
        )
      );
    } finally {
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
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setOpen(true)}
        aria-label="打开 AI 对话"
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)] text-white shadow-lg shadow-[var(--accent)]/30 transition-transform hover:scale-105 md:bottom-6 md:right-6 md:h-14 md:w-14"
        style={{ fontSize: 'clamp(1.1rem, 3vw, 1.4rem)' }}
      >
        ✦
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-0 backdrop-blur-sm md:items-center md:p-6"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[100dvh] w-full flex-col overflow-hidden border border-[var(--border)] bg-[var(--bg)] md:h-[min(80vh,640px)] md:w-[min(440px,100vw)] md:rounded-2xl md:shadow-2xl"
            >
              {/* 顶栏 */}
              <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3 md:px-5">
                <div>
                  <h2 className="font-display text-base font-medium md:text-lg">站内 AI 对话</h2>
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
                  <a
                    href="/chat"
                    className="rounded border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    全屏
                  </a>
                  <button
                    onClick={() => setOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-mute)] hover:bg-[var(--ink-mute)]/10"
                    aria-label="关闭"
                  >
                    ✕
                  </button>
                </div>
              </header>

              {/* 消息流 */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
                {messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <span className="text-2xl opacity-60">✦</span>
                    <p className="text-sm text-[var(--ink-mute)]">
                      问问关于博客内容的问题，
                      <br />
                      我会从相关文章里找答案。
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {['聊聊 Vibe Coding', '推荐一篇关于 AI 的文章', 'Hono 是什么？'].map((q) => (
                        <button
                          key={q}
                          onClick={() => setInput(q)}
                          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--ink-mute)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.id ?? i}
                    m={m}
                    onResend={() => {
                      const q = lastUserQuery();
                      if (q) {
                        setInput(q);
                        // 清掉中断的助手消息
                        setMessages((arr) => arr.filter((x) => !x.interrupted));
                      }
                    }}
                  />
                ))}
              </div>

              {/* 输入区 */}
              <footer className="shrink-0 border-t border-[var(--border)] p-3 md:p-4">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKey}
                    rows={1}
                    placeholder="输入问题…（Enter 发送，Shift+Enter 换行）"
                    disabled={sending}
                    className="flex-1 resize-none rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-[var(--ink-mute)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
                    style={{ maxHeight: '6em' }}
                  />
                  <button
                    onClick={send}
                    disabled={sending || !input.trim()}
                    className="btn btn-primary shrink-0 disabled:opacity-50"
                  >
                    {sending ? '…' : '发送'}
                  </button>
                </div>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MessageBubble({ m, onResend }: { m: Message; onResend?: () => void }) {
  const isUser = m.role === 'user';
  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed md:max-w-[80%] ${
          isUser
            ? 'bg-[var(--accent)] text-white'
            : 'border border-[var(--border)] bg-[var(--ink-mute)]/5 text-[var(--ink)]'
        }`}
      >
        <MarkdownContent role={m.role} text={m.content} pending={m.pending} />
        {m.interrupted && (
          <div className="mt-2 flex items-center gap-2 border-t border-dashed border-[var(--accent)]/40 pt-2 text-xs text-[var(--ink-mute)]">
            <span>↳ 聊天中断</span>
            {onResend && (
              <button
                onClick={onResend}
                className="rounded border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                title="把上一条用户问题重新填到输入框，点发送重试"
              >
                点击重新生成 ↻
              </button>
            )}
          </div>
        )}
        {!isUser && !m.interrupted && m.sources && m.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">
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
                className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--accent)] hover:bg-[var(--accent)]/20"
              >
                {s.type === 'post' ? `《${s.title ?? '文章'}》` : 'Vibe'} →
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 气泡内容：用户消息纯文本，助手消息用 markdown 渲染 */
function MarkdownContent({ role, text, pending }: { role: Message['role']; text: string; pending?: boolean }) {
  if (!text) {
    return <p className="opacity-60">{pending ? '正在思考…' : ''}</p>;
  }
  // 用户消息：纯文本（保留换行，避免误解析）
  if (role === 'user') {
    return <p className="whitespace-pre-wrap break-words">{text}</p>;
  }
  // 助手消息：marked 渲染（流式时也会「尽力而为」渲染半截 markdown）
  const html = renderChatMarkdown(text);
  return (
    <div
      className="chat-markdown break-words [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:font-semibold [&_a]:underline [&_a]:text-[var(--accent)] [&_a:hover]:opacity-80 [&_code]:rounded [&_code]:bg-[var(--ink-mute)]/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default ChatWidget;