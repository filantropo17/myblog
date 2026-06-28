#!/usr/bin/env node
// 修复清理后的注释残留：括号、空括号、空注释行、多余破折号、多余空行
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['apps/api/src', 'apps/web/src', 'apps/admin/src', 'apps/mcp/src', 'packages/shared/src'].map(p => join(ROOT, p));
const EXTS = ['.ts', '.tsx', '.astro'];

// 中文括号用 unicode escape
const LP = '\\uFF08'; // （
const RP = '\\uFF09'; // ）
const LDQ = '\\u2014\\u2014'; // ——

const RULES = [
  // 注释开头出现 "（ / " 残留
  [new RegExp('^\\s*\\*\\s*' + LP + '\\s*/.*' + RP + '\\s*', 'gm'), ' * '],
  // 整段 JSDoc 标题后的空括号 "（）。"
  [new RegExp(LP + '\\s*' + RP + '。', 'g'), '。'],
  // "（）"  各种位置
  [new RegExp('\\s*' + LP + '\\s*' + RP + '\\s*', 'g'), ''],
  // 单独空注释行："// "  后只剩空白
  [/^(\s*)\/\/\s*$/gm, ''],
  // JSDoc 行只剩星号 + 空白
  [/^(\s*)\*\s*$/gm, '$1*'],
  // 注释结尾的多余破折号
  [new RegExp('\\s*' + LDQ + '\\s*$', 'gm'), ''],
  // 注释开头的破折号分隔符 "// —— xxx"
  [new RegExp('^(\\s*\\/\\/\\s*)' + LDQ + '\\s+', 'gm'), '$1'],
  // 连续空行 → 1 个
  [/\n{3,}/g, '\n\n'],
];

let count = 0;
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (EXTS.some(e => full.endsWith(e))) yield full;
  }
}

for (const dir of SCAN_DIRS) {
  try { statSync(dir); } catch { continue; }
  for (const file of walk(dir)) {
    let src = readFileSync(file, 'utf8');
    const before = src;
    for (const [pat, rep] of RULES) src = src.replace(pat, rep);
    if (src !== before) {
      writeFileSync(file, src, 'utf8');
      count++;
      console.log('  fixed', relative(ROOT, file));
    }
  }
}
console.log('\n[fix-comment-glitches] fixed', count, 'files');