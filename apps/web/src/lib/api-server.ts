/**
 * 服务端 API 帮助函数。在 Astro 静态构建 / SSR 期间使用。
 * 在客户端请改用 `./theme.ts`（它有不同的默认行为）。
 */

const API_BASE =
  process.env.PUBLIC_API_BASE ?? 'http://localhost:8787';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  const json = (await res.json()) as { ok: boolean; data?: T; error?: string };
  if (!json.ok) {
    throw new Error(json.error ?? 'API error');
  }
  return json.data as T;
}

export async function getPosts(category?: string) {
  const qs = category ? `?category=${category}` : '';
  try {
    return await api<any[]>(`/api/v1/posts${qs}`);
  } catch {
    return [];
  }
}

export async function getPost(slug: string) {
  try {
    return await api<any>(`/api/v1/posts/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function getProjects() {
  try {
    return await api<any[]>(`/api/v1/projects`);
  } catch {
    return [];
  }
}

export async function getTags() {
  try {
    return await api<{ name: string; count: number }[]>(`/api/v1/posts/tags`);
  } catch {
    return [];
  }
}

export async function getSiteConfig() {
  try {
    return await api<any>(`/api/v1/settings/public`);
  } catch {
    return null;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(iso);
}
