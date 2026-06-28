/**
 * 配置加载 — 所有外部配置走环境变量，**绝不在代码里硬编码 URL**。
 *
 *   BLOG_API_BASE_URL    必填，例：
 *                          - 本地开发: http://localhost:8787
 *                          - 部署后:   https://blog.your-domain.com
 *   BLOG_AI_API_KEY      必填，对应服务端 AI_API_KEY（X-AI-API-Key header）
 *   BLOG_API_TIMEOUT_MS  可选，默认 30000
 */
export interface BlogConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export function loadConfig(): BlogConfig {
  const baseUrl = (process.env.BLOG_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.BLOG_AI_API_KEY ?? '').trim();
  const timeoutMs = Number(process.env.BLOG_API_TIMEOUT_MS ?? 30_000);

  if (!baseUrl) {
    throw new Error(
      'BLOG_API_BASE_URL is required.\n' +
        '  - 本地开发: export BLOG_API_BASE_URL=http://localhost:8787\n' +
        '  - 部署后:   export BLOG_API_BASE_URL=https://blog.your-domain.com'
    );
  }
  if (!apiKey) {
    throw new Error('BLOG_AI_API_KEY is required (对应服务端 AI_API_KEY 的值)');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('BLOG_API_TIMEOUT_MS must be a positive number');
  }
  return { baseUrl, apiKey, timeoutMs };
}
