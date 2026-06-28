/**
 * 用于 Hero 的打字机 / 角色循环动画文本。
 *
 * 真实动态打字机（光标跟文字滑）：
 * - DOM 顺序 [text, cursor]
 * - flex-direction: row-reverse：视觉上 [cursor, text] —— cursor 在左、text 在右
 * - justify-content: flex-start：row-reverse 下推向右，text 紧贴容器右
 * - 光标紧贴 text 起点（左侧）= 下一个字符要出现的位置
 * - text 短时 text 起点向左移、cursor 跟着向左滑
 *
 * 这正是经典 terminal typing 效果：text 从右往左"长出来"，光标就是 caret 位置。
 */
import { useEffect, useState } from 'react';

interface TypewriterTextProps {
  words: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseMs?: number;
  className?: string;
  /** 容器最小宽度（ch 单位），按最长词撑开。 */
minWidthCh?: number;
  /** 是否显示光标（默认 true） */
showCursor?: boolean;
  /**
* 容器布局：
   * - 'inline'（默认）：inline-block，DOM [text, cursor] 顺序，cursor 紧贴 text 右侧
   * - 'block'：flex row-reverse + flex-start，文字从右向左长，光标跟文字滑
   */
layout?: 'inline' | 'block';
}

export function TypewriterText({
  words,
  typingSpeed = 70,
  deletingSpeed = 35,
  pauseMs = 1500,
  className = '',
  minWidthCh,
  showCursor = true,
  layout = 'inline',
}: TypewriterTextProps) {
  const longestLen = words.reduce((m, w) => Math.max(m, w.length), 0);
  const minW = minWidthCh ?? Math.ceil(longestLen * 1.25);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing');

  useEffect(() => {
    const word = words[idx] ?? '';
    let timer: ReturnType<typeof setTimeout>;

    if (phase === 'typing') {
      if (text.length < word.length) {
        timer = setTimeout(() => setText(word.slice(0, text.length + 1)), typingSpeed);
      } else {
        timer = setTimeout(() => setPhase('pausing'), pauseMs);
      }
    } else if (phase === 'pausing') {
      timer = setTimeout(() => setPhase('deleting'), pauseMs);
    } else if (phase === 'deleting') {
      if (text.length > 0) {
        timer = setTimeout(() => setText(word.slice(0, text.length - 1)), deletingSpeed);
      } else {
        setIdx((idx + 1) % words.length);
        setPhase('typing');
        return;
      }
    }

    return () => clearTimeout(timer);
  }, [text, phase, idx, words, typingSpeed, deletingSpeed, pauseMs]);

  const cursorBlink = phase === 'pausing';
  const cursorColor = phase === 'deleting' ? 'var(--accent)' : 'var(--ink-soft)';

  // 光标 span：width 0 + border-right 2px 细线，不占位，紧贴前一个元素
  const cursorSpan = showCursor ? (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: 0,
        height: '1em',
        verticalAlign: 'baseline',
        borderRight: `2px solid ${cursorColor}`,
        animation: cursorBlink
          ? 'twCursorBlink 1s steps(2, start) infinite'
          : 'none',
        borderRadius: '1px',
        flexShrink: 0,
      }}
    />
  ) : null;

  if (layout === 'block') {
    // 真实 terminal 效果：文字紧贴右、光标紧贴文字右侧
    // - flex + justify-end：DOM [text, cursor] 整体推右
    // - text 短时 text+cursor 整体推右、cursor 紧贴容器右
    // - text 长时溢出右、cursor 紧贴 text 末尾
    return (
      <span
        className={`flex items-baseline whitespace-nowrap ${className}`}
        style={{
          minHeight: '1em',
          justifyContent: 'flex-end',
        }}
      >
        <span>{text}</span>
        {cursorSpan}
      </span>
    );
  }

  // inline：cursor 紧贴 text 右侧
  return (
    <span
      className={`inline-block whitespace-nowrap align-baseline ${className}`}
      style={{ minWidth: `${minW}ch` }}
    >
      <span>{text}</span>
      {cursorSpan}
    </span>
  );
}
