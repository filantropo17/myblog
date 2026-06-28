/**
 * 展示层本地化映射：DB / API 层的 enum 值保持英文（不要破坏数据），
 * 前端展示时通过这里翻成中文。
 */

export const COMMENT_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  approved: '已通过',
  spam: '垃圾',
  rejected: '已拒绝',
};

export const VIBE_MOOD_LABEL: Record<string, string> = {
  happy: '开心',
  think: '思考',
  angry: '烦躁',
  tired: '疲倦',
  inspired: '灵感',
  chill: '放空',
};

export const VIBE_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  hidden: '隐藏',
};

export function moodLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return VIBE_MOOD_LABEL[value] ?? value;
}

export function commentStatusLabel(value: string): string {
  return COMMENT_STATUS_LABEL[value] ?? value;
}
