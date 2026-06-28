/**
 * HTTP 客户端 —— 调 /api/mcp/* 端点。
 */
import type { BlogConfig } from './config.js';

export class BlogApiError extends Error {
  constructor(public status: number, public body: any, message: string) {
    super(message);
    this.name = 'BlogApiError';
  }
}

export class BlogClient {
  constructor(private cfg: BlogConfig) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-AI-API-Key': this.cfg.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      if (!res.ok) {
        throw new BlogApiError(res.status, json, `${method} ${path} → ${res.status}`);
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = any>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  patch<T = any>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  delete<T = any>(path: string) {
    return this.request<T>('DELETE', path);
  }
}
