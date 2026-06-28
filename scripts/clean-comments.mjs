#!/usr/bin/env node
/**
 * 清理 apps/ 下所有源码中的「非技术性注释」：
 *   - "PRD §x" / "PRD x.x" / "PRD 2.0"  等产品需求引用
 *   - "CLAUDE.md §x" / "§x" 项目偏好引用
 *   - "用户要求" / "用户偏好" / "不要乱猜" 等用户偏好引用
 *   - "（PRD 2.0 阶段二起用户改为本地更新）" 这种描述产品决策的注释
 *
 * 保留：
 *   - 解释"是什么/怎么用/参数含义"的技术注释
 *   - 函数 JSDoc / 解释算法 / 解释复杂数据流
 *   - "XXX:" 这种文件级目的说明
 *
 * 策略：在每条注释行内「删除引用片段，保留语义」。
 * 例子：
 *   "// 用户与会话（PRD 2.0 §4.2）"      → "// 用户与会话"
 *   " * Session-based 鉴权（PRD §4.3.1）" → " * Session-based 鉴权"
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['apps/api/src', 'apps/web/src', 'apps/admin/src', 'apps/mcp/src', 'packages/shared/src'].map(p => join(ROOT, p));
const EXTS = ['.ts', '.tsx', '.astro'];

// 匹配规则：每条是一个 [pattern, replacement]
// 模式按"长 → 短"排序，避免短模式破坏长模式的剩余部分
const RULES = [
  // PRD 2.0 §x.x.x  /  PRD §x.x.x  /  PRD 2.0 §x  /  PRD §x
  [/\s*\(?PRD\s*2\.0\s*§[\d.]+(?:\/[^)]+)?\)?/g, ''],
  [/\s*\(?PRD\s*1\.0\s*§[\d.]+(?:\+[^)]+)?\)?/g, ''],
  [/\s*\(?PRD\s*§[\d.]+(?:\s*\+\s*用户要求)?\)?/g, ''],
  // 单独的 "(PRD 2.0)" / "(PRD 1.0)"
  [/\s*\(PRD\s*[12]\.0\)/g, ''],
  // "PRD 2.0" / "PRD 1.0"  出现位置：行尾 / 行首
  [/\bPRD\s*[12]\.0\b/g, ''],
  // "PRD §x.x.x" 单独出现
  [/\bPRD\s*§[\d.]+/g, ''],
  // "CLAUDE.md §x" / "CLAUDE.md §x.x"
  [/\s*\(?CLAUDE\.md\s*§[\d.]+\)?/g, ''],
  // 残留的 "§x.x" 单独（前面通常还有空格）
  [/\s*§[\d.]+/g, ''],
  // "（PRD 2.0 阶段二起用户改为本地更新）" 这种整段
  [/\s*\(PRD\s*[12]\.0\s*[^)]+\)/g, ''],
  // "（1.0 + ...）"
  [/\s*\(1\.0\s*\+\s*[^)]+\)/g, ''],
  // "（... + 用户要求）"
  [/\s*\+\s*用户要求/g, ''],
  // "用户要求" 残留
  [/\s*\(?用户要求\)?/g, ''],
  // "用户偏好" 残留
  [/\s*\(?用户偏好\)?/g, ''],
  // 清理空注释行 / 注释只剩标点
  [/^\s*\/\/\s*[\s,，。：；]+\s*$/gm, ''],
  [/^\s*\*\s*[\s,，。：；]+\s*$/gm, ''],
  // 清理 "(xxx PRD 2.0 extensions)" 之类日志
  [/\s*with\s+PRD\s*[12]\.0\s+extensions/gi, ''],
];

let totalEdits = 0;
let fileCount = 0;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (EXTS.some(e => full.endsWith(e))) {
      yield full;
    }
  }
}

for (const dir of SCAN_DIRS) {
  try { statSync(dir); } catch { continue; }
  for (const file of walk(dir)) {
    let src = readFileSync(file, 'utf8');
    let before = src;
    for (const [pat, rep] of RULES) {
      src = src.replace(pat, rep);
    }
    // 清理双空格（注释里）
    src = src.replace(/([\/\*]\s)\s{2,}/g, '$1');
    if (src !== before) {
      writeFileSync(file, src, 'utf8');
      const diff = before.length - src.length;
      totalEdits += 1;
      fileCount += 1;
      console.log(`  ✓ ${relative(ROOT, file)}  (-${diff} chars)`);
    }
  }
}

console.log(`\n✅ cleaned ${fileCount} files (${totalEdits} edits)`);