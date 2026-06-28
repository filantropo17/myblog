/**
 * 敏感词检测。
 *
 * 返回是否命中以及命中的关键字列表。命中后评论进入 pending + warning 状态。
 *
 * 注：词表写在此处作为兜底；生产可在 settings 表里维护可编辑的词表。
 */
const SENSITIVE = [
  '色情',
  '赌博',
  '毒品',
  '诈骗',
  'spam',
  '广告',
  '代刷',
  '私聊',
  '加微',
  '黄片',
  '裸聊',
];

export function detectSensitive(text: string): { hit: boolean; words: string[] } {
  const lower = text.toLowerCase();
  const hits = SENSITIVE.filter((w) => lower.includes(w.toLowerCase()));
  return { hit: hits.length > 0, words: hits };
}