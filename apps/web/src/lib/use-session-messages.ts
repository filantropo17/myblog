/**
 * sessionStorage 缓存的对话消息 hook。
 *
 * 行为：
 * - 同一个浏览器标签页：换路由 / 关闭展开抽屉 → 历史保留
 * - 关闭标签页 / 关闭浏览器 → sessionStorage 自动失效 → 清空
 * - SSR 安全：typeof window 判断
 *
 * 跨组件共享 key：`myblog.chat.history`（同时给 ChatWidget / ChatFullscreen 用）。
 *
 * 写入策略：每条消息都写，包括流式中（pending=true）。但 pending=true 标记为 `interrupted`，
 * 恢复时前端显示「聊天中断，点击重新生成」按钮。
 */
import { useEffect, useState } from 'react';

export type ChatSource = { type: 'post' | 'vibe'; id: number; slug?: string; title?: string };
export type ChatMessage = {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: ChatSource[];
  pending?: boolean;
  /** 从 storage 恢复时被标记：上次会话中断在流式中 */
interrupted?: boolean;
};

const STORAGE_KEY = 'myblog.chat.history';

/** SSR-safe 读 sessionStorage（流式中的也保留，但标 interrupted） */
function readStorage(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is ChatMessage =>
        m && typeof m === 'object' && typeof m.content === 'string'
      )
      .map((m) => (m.pending ? { ...m, pending: false, interrupted: true } : m));
  } catch {
    return [];
  }
}

function writeStorage(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    // 持久化所有稳定消息 + 当前流式中的快照（带 pending=true 标记 interrupted）
    const serialized = messages.map((m) =>
      m.interrupted ? { ...m, pending: true, interrupted: false } : m
    );
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // 满了 / 隐私模式 → 静默失败
  }
}

function clearStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * 用 useState + useEffect 把 messages 同步到 sessionStorage。
 * 返回 [messages, setMessages, clearHistory, lastUserQuery]
 * - lastUserQuery: 用于「聊天中断」按钮的回填 / 重新发送
 */
export function useSessionMessages(): [
  ChatMessage[],
  React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  () => void,
  () => string | null,
] {
  // 初始值是空；useEffect 里读 storage（避免 SSR/CSR mismatch）
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 挂载时读
  useEffect(() => {
    setMessages(readStorage());
  }, []);

  // 变化时写
  // 注意：不在 messages=[] 时清 storage —— 第一次 mount 时 messages 初始是 []
  // （storage 内容还在异步 setMessages 回来），如果这里先 clearStorage 就把用户内容擦掉了。
  // clearHistory() 才是用户主动清空的入口。
  useEffect(() => {
    if (messages.length > 0) {
      writeStorage(messages);
    }
  }, [messages]);

  const clearHistory = () => {
    clearStorage();
    setMessages([]);
  };

  /** 拿到最后一条用户问题（用于「重新发送」按钮回填） */
const lastUserQuery = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return null;
  };

  return [messages, setMessages, clearHistory, lastUserQuery];
}