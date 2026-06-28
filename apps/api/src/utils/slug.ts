/**
 * 将标题转换为 URL 安全的 slug 字符串。
 * 采用对英文友好的转写策略：
 * - 对于 CJK（中/日/韩）内容，使用 `p-{id}-{hex}` 前缀，保证 URL 在不同语言下
 * 均为 ASCII 安全且稳定。
 * - 其余情况则转写并小写化。
 */

const CJK = /[一-鿿぀-ヿ가-힯]/;

export function generateSlug(title: string, id?: number): string {
  // CJK 内容：使用基于 ID 的稳定 slug 以保证 URL 安全
  if (CJK.test(title)) {
    const suffix = id ? String(id) : String(Date.now());
    return `p-${suffix}`;
  }

  const base = title
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return base || `p-${id ?? Date.now()}`;
}
