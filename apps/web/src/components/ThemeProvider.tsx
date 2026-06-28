/**
 * 主题 + 光标 + 页面加载器 React 岛屿。
 * 在全局布局中只挂载一次。
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('myblog-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('myblog-theme', next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="切换主题"
      // mobile: 避开 sticky Header（高约 60px），下移到 top-20 (80px)
      // desktop: 原位置 top-5 (20px) 仍 OK
      className="group fixed right-5 top-20 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-soft)] backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-[var(--accent)] hover:text-[var(--accent)] md:top-5"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === 'dark' ? (
          <motion.svg
            key="sun"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </motion.svg>
        ) : (
          <motion.svg
            key="moon"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </motion.svg>
        )}
      </AnimatePresence>
    </button>
  );
}

/**
 * 自定义光标跟随器 —— 磁性圆环 + 圆点。
 * 在触摸设备上通过 CSS 禁用。
 */
export function CursorFollower() {
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.left = `${mouseX}px`;
      dot.style.top = `${mouseY}px`;
    };
    const onEnter = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.closest('a, button, [data-cursor="hover"]')) {
        ring.classList.add('hover');
      }
    };
    const onLeave = () => ring.classList.remove('hover');

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onEnter);
    document.addEventListener('mouseout', onLeave);

    let rafId: number;
    const animate = () => {
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      rafId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onEnter);
      document.removeEventListener('mouseout', onLeave);
      cancelAnimationFrame(rafId);
      dot.remove();
      ring.remove();
    };
  }, []);

  return null;
}

/**
 * 页面顶部的滚动进度指示器。
 */
export function ScrollProgress() {
  useEffect(() => {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.style.width = '0';
    document.body.appendChild(bar);

    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.width = `${pct}%`;
    };
    window.addEventListener('scroll', update);
    update();
    return () => {
      window.removeEventListener('scroll', update);
      bar.remove();
    };
  }, []);
  return null;
}

/**
 * 一次性带 logo 标识的页面加载器。
 * 整个生命周期交给 CSS animation forwards 控制：入场 0.4s + 短暂停留 + 退场 0.35s。
 * 不依赖 React state，避免 hydration 时序导致提前消失。
 */
export function PageLoader() {
  return (
    <div className="page-loader" aria-hidden>
      <div className="loader-mark">myblog</div>
    </div>
  );
}
