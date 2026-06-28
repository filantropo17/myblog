/**
 * 作者信息 —— 从根 .env 的 AUTHOR_* 注入。
 *
 * 流程：
 *   1. astro.config.mjs 读根 .env 的 AUTHOR_NAME / AUTHOR_EMAIL / AUTHOR_GITHUB
 *   2. 通过 vite.define 注入全局常量 __AUTHOR_NAME__ 等
 *   3. 本文件用 TypeScript declare 暴露给业务代码
 *
 * 运行时仍可被后端 /api/v1/settings/public.author 覆盖（DB 优先）。
 */

// vite.define 注入的全局常量
declare const __AUTHOR_NAME__: string;
declare const __AUTHOR_EMAIL__: string;
declare const __AUTHOR_GITHUB__: string;

export const SITE_AUTHOR = {
  name: __AUTHOR_NAME__ || 'Anonymous',
  email: __AUTHOR_EMAIL__ || '',
  github: __AUTHOR_GITHUB__ || '#',
} as const;
