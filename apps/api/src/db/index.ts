import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;

// 基于文件位置定位 apps/api 根目录（与 cwd 解耦，从 monorepo 任意目录启动都能找到 data/myblog.db）
const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function getDb() {
  if (_db) return _db;

  // .env.example 里 DB_PATH 是相对 apps/api 的（默认 ../../data/myblog.db → monorepo/data/myblog.db）
  const dbPath = process.env.DB_PATH
    ? resolve(API_ROOT, process.env.DB_PATH)
    : resolve(API_ROOT, '../../data/myblog.db');
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _sqlite = new Database(dbPath);
  // WAL 模式 + 合理的性能默认设置
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('synchronous = NORMAL');
  _sqlite.pragma('foreign_keys = ON');
  _sqlite.pragma('busy_timeout = 5000');
  _sqlite.pragma('cache_size = -64000'); // 64MB

  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getRawSqlite() {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export { schema };
