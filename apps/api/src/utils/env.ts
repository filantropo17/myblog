/**
 * 加载 .env —— 无论从哪个 cwd 启动都能找到 .env。
 *
 * 加载顺序（后者覆盖前者）：
 *   1. 仓库根目录 .env（全局共享）
 *   2. apps/api/.env（API 局部覆盖）
 *
 * 用 `import.meta.url` 解析文件自身位置，向上找 .env。
 * 必须在所有使用 `process.env` 的代码之前 import。
 *
 * 用法（在入口文件第一行）：
 * import './utils/env.js';
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
// env.ts 在 apps/api/src/utils/env.ts → ../../../../ 是仓库根
const rootEnv = resolve(here, '../../../../.env');
const localEnv = resolve(here, '../../.env');

if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv, quiet: true });
}
if (existsSync(localEnv)) {
  loadEnv({ path: localEnv, quiet: true, override: true });
}
