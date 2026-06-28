import { useEffect } from 'react';

interface Props {
  targetType: 'post' | 'vibe' | 'page';
  targetId?: number;
  path: string;
  apiBase: string;
}

function utmFromUrl(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string> = {};
  const sp = new URLSearchParams(window.location.search);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = sp.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export default function ViewBeacon({ targetType, targetId, path, apiBase }: Props) {
  useEffect(() => {
    const utm = utmFromUrl();
    const referer = document.referrer || undefined;

    // 进入即上报一次 view（用 sendBeacon 更可靠）
    const payload = JSON.stringify({
      target_type: targetType,
      target_id: targetId,
      path,
      referer,
      ...utm,
    });

    const sendView = () => {
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        const ok = navigator.sendBeacon?.(`${apiBase}/api/v1/track/view`, blob);
        if (!ok) {
          fetch(`${apiBase}/api/v1/track/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // 静默失败
      }
    };
    sendView();

    // 30 秒后上报阅读时长
    const start = Date.now();
    const sendDuration = () => {
      const ms = Date.now() - start;
      try {
        const blob = new Blob(
          [JSON.stringify({ path, duration_ms: ms })],
          { type: 'application/json' }
        );
        navigator.sendBeacon?.(`${apiBase}/api/v1/track/duration`, blob);
      } catch {
        // 忽略
      }
    };
    const timer = window.setTimeout(sendDuration, 30_000);
    return () => window.clearTimeout(timer);
  }, [apiBase, targetType, targetId, path]);

  return null;
}