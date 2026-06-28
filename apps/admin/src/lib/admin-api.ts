/**
 * 带鉴权的管理后台 API 客户端（ session-based）。
 */
const API_BASE =
  (typeof window !== 'undefined' && (window as any).PUBLIC_API_BASE) ||
  'http://localhost:8787';

const USER_KEY = 'myblog-admin-user';

export function setAuth(user: string) {
  localStorage.setItem(USER_KEY, user);
}

export function clearAuth() {
  localStorage.removeItem(USER_KEY);
}

export function getAuth() {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem(USER_KEY);
  if (!user) return null;
  return { user };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include', // 关键：发送 myblog_session cookie
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  // 全局 401 拦截：cookie 失效/未登录 → 清本地状态 + 派发 auth:logout 事件
  // 排除 /auth/login 本身（密码错要展示错误，不应跳走）
  // 排除 /auth/register（注册失败也不跳走）
  if (res.status === 401 && !path.startsWith('/api/v1/auth/login') && !path.startsWith('/api/v1/auth/register')) {
    clearAuth();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:logout', { detail: { path, status: 401 } }));
    }
    throw new Error('Unauthorized');
  }

  const json = (await res.json()) as { ok: boolean; data?: T; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json.data as T;
}

export const adminApi = {
  login: async (identifier: string, password: string) => {
    const data = await call<{ username: string; role: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setAuth(data.username);
    return data;
  },

  logout: async () => {
    try {
      await call('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // 忽略
    }
    clearAuth();
  },

  stats: () => call<any>('/api/v1/analytics/stats'),
  aiContext: () => call<any>('/api/v1/analytics/ai-context'),
  auditLogs: (limit = 50) => call<any[]>(`/api/v1/analytics/audit?limit=${limit}`),

  listPosts: (status?: string) =>
    call<any[]>(`/api/v1/posts/admin/all${status ? `?status=${status}` : ''}`),
  getPost: (id: number) => call<any[]>(`/api/v1/posts/admin/all`).then((posts: any[]) => posts.find((p: any) => p.id === id)),
  updatePost: (id: number, patch: any) =>
    call<any>(`/api/v1/posts/admin/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePost: (id: number) =>
    call<any>(`/api/v1/posts/admin/${id}`, { method: 'DELETE' }),

  listProjects: () => call<any[]>('/api/v1/projects'),
  createProject: (data: any) =>
    call<any>('/api/v1/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: number, patch: any) =>
    call<any>(`/api/v1/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: number) =>
    call<any>(`/api/v1/projects/${id}`, { method: 'DELETE' }),

  createPost: (data: {
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    seo_description?: string;
    cover_image_url?: string;
  }) =>
    call<any>('/api/v1/posts/manual', { method: 'POST', body: JSON.stringify(data) }),

  // === Vibe ===
  vibeAll: () => call<any[]>('/api/v1/admin/vibe'),
  vibeCreate: (data: any) => call<any>('/api/v1/admin/vibe', { method: 'POST', body: JSON.stringify(data) }),
  vibeUpdate: (id: number, data: any) => call<any>(`/api/v1/admin/vibe/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  vibeDelete: (id: number) => call<any>(`/api/v1/admin/vibe/${id}`, { method: 'DELETE' }),

  // === Comments ===
  commentsList: (status: string) => call<any[]>(`/api/v1/admin/comments?status=${status}`),
  commentModerate: (id: number, action: 'approve' | 'reject' | 'spam') =>
    call<any>(`/api/v1/admin/comments/${id}/moderate`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  commentDelete: (id: number) => call<any>(`/api/v1/admin/comments/${id}`, { method: 'DELETE' }),

  // === Users ===
  usersList: () => call<any[]>('/api/v1/admin/users'),
  userCreate: (data: any) => call<any>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  userUpdate: (id: number, patch: any) =>
    call<any>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  // === Subscribers ===
  subscribersList: () => call<any[]>('/api/v1/admin/subscribers'),
  subscriberDelete: (id: number) => call<any>(`/api/v1/admin/subscribers/${id}`, { method: 'DELETE' }),

  // === Analytics ===
  analytics: (range: '7d' | '30d' | '90d' = '30d') =>
    call<{
      stats: {
        todayPV: number;
        yesterdayPV: number;
        weekPV: number;
        totalPosts: number;
        pendingComments: number;
        subscribersCount: number;
        usersCount: number;
        activeChats: number;
        recentAuditCount: number;
      };
      range: number;
      trend: Array<{ date: string; views: number }>;
      sources: Array<{ source: string; count: number; label: string }>;
      topPosts: Array<{ id: number; slug: string; title: string; views: number }>;
      vibeStats: { monthCount: number; totalLikes: number };
      topTags: Array<{ name: string; slug: string; count: number }>;
      commentsTrend: Array<{ date: string; count: number }>;
    }>(`/api/v1/admin/analytics?range=${range}`),

  // === Search Index ===
  searchRebuild: () => call<any>('/api/v1/admin/search/rebuild', { method: 'POST' }),
  searchStatus: () => call<any>('/api/v1/admin/search/status'),

  // === LLM Config（对话 AI 管理）===
  llmConfigGet: () =>
    call<{
      enabled: boolean;
      base_url: string;
      api_key: string;
      model: string;
      timeout_ms: number;
      source: {
        baseUrl: 'settings' | 'env';
        apiKey: 'settings' | 'env';
        model: 'settings' | 'env';
        timeoutMs: 'settings' | 'env';
      } | null;
      active: boolean;
    }>('/api/v1/admin/llm-config'),
  llmConfigSave: (data: {
    enabled: boolean;
    base_url: string;
    api_key: string;
    model: string;
    timeout_ms: number;
  }) =>
    call<{ saved: boolean }>('/api/v1/admin/llm-config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  llmConfigTest: () =>
    call<{ ok: boolean; latency_ms?: number; model?: string; base_url?: string }>(
      '/api/v1/admin/llm-config/test',
      { method: 'POST' }
    ),
};
