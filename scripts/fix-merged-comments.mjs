#!/usr/bin/env node
// 修复"注释行尾 + 代码挤在同行"的破坏
// 模式：// 注释文字<keyword>  →  // 注释文字\n<keyword>
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCAN = ['apps/api/src', 'apps/web/src', 'apps/admin/src', 'apps/mcp/src', 'packages/shared/src'];
const EXTS = ['.ts', '.tsx'];
const KEYWORDS = [
  'if', 'else', 'return', 'const', 'let', 'var', 'await', 'async', 'throw', 'break', 'continue',
  'switch', 'case', 'try', 'catch', 'finally', 'export', 'import', 'function', 'class',
  'interface', 'type', 'enum', 'for', 'while', 'do', 'new', 'delete', 'void', 'yield',
  'public', 'private', 'protected', 'static', 'readonly',
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

for (const dir of SCAN.map(d => join(process.cwd(), d))) {
  try { statSync(dir); } catch { continue; }
  for (const file of walk(dir)) {
    let src = readFileSync(file, 'utf8');
    let before = src;
    // 单行注释：// ... 文字<keyword>...  →  // ... 文字\n<keyword>...
    const re = new RegExp('(\\/\\/[^\\n]*?)(' + KEYWORDS.join('|') + ')\\b', 'g');
    src = src.replace(re, (_m, cmt, kw) => cmt.trimEnd() + '\n' + kw);
    if (src !== before) {
      writeFileSync(file, src, 'utf8');
      count++;
      console.log('  fixed', file);
    }
  }
}
console.log('\n[fix-merged-comments] fixed', count, 'files');
