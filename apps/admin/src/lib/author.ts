/**
 * 作者信息 —— 从根 .env 的 AUTHOR_* 注入。
 */

declare const __AUTHOR_NAME__: string;
declare const __AUTHOR_EMAIL__: string;
declare const __AUTHOR_GITHUB__: string;

export const SITE_AUTHOR = {
  name: __AUTHOR_NAME__ || 'Anonymous',
  email: __AUTHOR_EMAIL__ || '',
  github: __AUTHOR_GITHUB__ || '#',
} as const;
