/**
 * MyBlog web 端的轻量级客户端工具。
 */

const API_BASE =
  typeof import.meta.env.PUBLIC_API_BASE === 'string'
    ? import.meta.env.PUBLIC_API_BASE
    : 'http://localhost:8787';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as { ok: boolean; data?: T; error?: string };
  if (!json.ok) {
    throw new Error(json.error ?? 'API error');
  }
  return json.data as T;
}

export async function getPosts(category?: string) {
  const qs = category ? `?category=${category}` : '';
  return api<any[]>(`/api/v1/posts${qs}`);
}

export async function getPost(slug: string) {
  return api<any>(`/api/v1/posts/${encodeURIComponent(slug)}`);
}

export async function getProjects() {
  return api<any[]>(`/api/v1/projects`);
}

export async function getTags() {
  return api<{ name: string; count: number }[]>(`/api/v1/posts/tags`);
}

export async function getSiteConfig() {
  return api<any>(`/api/v1/settings/public`);
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
