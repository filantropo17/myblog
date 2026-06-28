/**
 * 手动 schema 迁移（因为我们将 schema 写在代码中，只需应用一次）。
 * 使用原生 SQL — 简单、快速，SQLite 场景下无需额外的 migrations 目录。
 *
 * 兼容两种场景：
 *  1. 全新库：CREATE TABLE IF NOT EXISTS + CREATE VIRTUAL TABLE + CREATE TRIGGER
 *  2. 已有库（从 1.0 升级）：ALTER TABLE ADD COLUMN（先 PRAGMA 检查）
 */
import '../utils/env.js'; // 必须第一行：基于文件位置加载 .env
import { getRawSqlite } from './index.js';

const SCHEMA = `
-- ---------------------------------------------------------------------------
-- 文章（1.0 + 2.0 新增列）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  category TEXT CHECK(category IN ('tech','project','diary')),
  tags TEXT DEFAULT '[]' NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','published','rejected')) NOT NULL,
  source_type TEXT CHECK(source_type IN ('github','outline','trending','manual')),
  source_meta TEXT,
  seo_description TEXT,
  cover_image_url TEXT,
  ai_review_feedback TEXT,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

CREATE TABLE IF NOT EXISTS post_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  edited_by TEXT CHECK(edited_by IN ('ai','admin','user')) NOT NULL,
  change_summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ---------------------------------------------------------------------------
-- 项目（1.0）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  tech_stack TEXT DEFAULT '[]' NOT NULL,
  github_url TEXT,
  demo_url TEXT,
  full_project_url TEXT,
  changelog TEXT,
  screenshots TEXT DEFAULT '[]' NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','planned')) NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  github_meta TEXT,
  last_synced_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ---------------------------------------------------------------------------
-- AI 审计日志（1.0）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  payload_summary TEXT,
  response_status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON ai_audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- 设置（1.0）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ---------------------------------------------------------------------------
-- 用户与会话-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'reader' CHECK(role IN ('admin','editor','author','reader')),
  bio TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')) NOT NULL,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at DATETIME NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Vibe 笔记-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vibe_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  content TEXT NOT NULL,
  mood TEXT CHECK(mood IN ('happy','think','angry','tired','inspired','chill')),
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'published' CHECK(status IN ('draft','published','hidden')) NOT NULL,
  pinned INTEGER DEFAULT 0 NOT NULL,
  like_count INTEGER DEFAULT 0 NOT NULL,
  view_count INTEGER DEFAULT 0 NOT NULL,
  comment_count INTEGER DEFAULT 0 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vibe_status_created ON vibe_notes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vibe_author ON vibe_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_vibe_mood ON vibe_notes(mood);

-- ---------------------------------------------------------------------------
-- 标签-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  post_count INTEGER DEFAULT 0 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);

-- ---------------------------------------------------------------------------
-- 评论-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT CHECK(target_type IN ('post','vibe')) NOT NULL,
  target_id INTEGER NOT NULL,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_role TEXT,
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','spam','rejected')) NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);

-- ---------------------------------------------------------------------------
-- 点赞 / 反应-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT CHECK(target_type IN ('post','vibe','comment')) NOT NULL,
  target_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  visitor_hash TEXT,
  reaction TEXT DEFAULT 'like' CHECK(reaction IN ('like','love','insightful')) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(target_type, target_id, user_id, reaction),
  UNIQUE(target_type, target_id, visitor_hash, reaction)
);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);

-- ---------------------------------------------------------------------------
-- 阅读量-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT CHECK(target_type IN ('post','vibe','page')) NOT NULL,
  target_id INTEGER,
  path TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  user_agent TEXT,
  referer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  country TEXT,
  read_duration_ms INTEGER DEFAULT 0 NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_views_target ON page_views(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_views_path_date ON page_views(path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_views_visitor ON page_views(visitor_hash, created_at);

-- ---------------------------------------------------------------------------
-- 订阅者-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  confirm_token TEXT NOT NULL,
  confirmed_at DATETIME,
  unsubscribe_token TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','unsubscribed')) NOT NULL,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

-- ---------------------------------------------------------------------------
-- AI 站内对话-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash TEXT,
  title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('user','assistant','system')) NOT NULL,
  content TEXT NOT NULL,
  sources TEXT,
  tokens_used INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
`;

/**
 * 检测表中是否已存在某列。
 */
function hasColumn(sqlite: ReturnType<typeof getRawSqlite>, table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

/**
 * 对已存在的 1.0 库做向后兼容 ALTER（添加  新增列）。
 * 全新库通过上面 CREATE TABLE 即可，无需再 ALTER。
 */
const MIGRATIONS_2_0: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'posts', column: 'key_points', ddl: "ALTER TABLE posts ADD COLUMN key_points TEXT DEFAULT '[]' NOT NULL" },
  { table: 'posts', column: 'reading_time_minutes', ddl: 'ALTER TABLE posts ADD COLUMN reading_time_minutes INTEGER' },
  { table: 'posts', column: 'author_id', ddl: 'ALTER TABLE posts ADD COLUMN author_id INTEGER REFERENCES users(id) ON DELETE SET NULL' },
  { table: 'posts', column: 'updated_by', ddl: 'ALTER TABLE posts ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL' },
  { table: 'posts', column: 'view_count', ddl: 'ALTER TABLE posts ADD COLUMN view_count INTEGER DEFAULT 0 NOT NULL' },
  { table: 'posts', column: 'comment_count', ddl: 'ALTER TABLE posts ADD COLUMN comment_count INTEGER DEFAULT 0 NOT NULL' },
  { table: 'posts', column: 'like_count', ddl: 'ALTER TABLE posts ADD COLUMN like_count INTEGER DEFAULT 0 NOT NULL' },
  { table: 'projects', column: 'author_id', ddl: 'ALTER TABLE projects ADD COLUMN author_id INTEGER REFERENCES users(id) ON DELETE SET NULL' },
  { table: 'post_versions', column: 'edited_by_id', ddl: 'ALTER TABLE post_versions ADD COLUMN edited_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL' },
  // 2.0 升级：vibe_notes 加 title 字段（让 Vibe 有标题）
  { table: 'vibe_notes', column: 'title', ddl: 'ALTER TABLE vibe_notes ADD COLUMN title TEXT' },
];

/**
 * 创建 FTS5 虚拟表 + 触发器。
 * 写入/更新/删除时自动同步索引。
 */
function ensureFts(sqlite: ReturnType<typeof getRawSqlite>) {
  // 检测是否已有 FTS 表
  const tables = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name IN ('posts_fts','vibe_fts')`)
    .all() as Array<{ name: string }>;
  const names = new Set(tables.map((t) => t.name));

  if (!names.has('posts_fts')) {
    sqlite.exec(`
      CREATE VIRTUAL TABLE posts_fts USING fts5(
        title,
        content,
        tags,
        content='posts',
        content_rowid='id',
        tokenize='unicode61'
      );
      CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN
        INSERT INTO posts_fts(rowid, title, content, tags)
        VALUES (new.id, new.title, new.content, new.tags);
      END;
      CREATE TRIGGER posts_ad AFTER DELETE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, title, content, tags)
        VALUES ('delete', old.id, old.title, old.content, old.tags);
      END;
      CREATE TRIGGER posts_au AFTER UPDATE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, title, content, tags)
        VALUES ('delete', old.id, old.title, old.content, old.tags);
        INSERT INTO posts_fts(rowid, title, content, tags)
        VALUES (new.id, new.title, new.content, new.tags);
      END;
      -- 初始填充
      INSERT INTO posts_fts(rowid, title, content, tags)
      SELECT id, title, content, tags FROM posts;
    `);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at)`);
  }

  if (!names.has('vibe_fts')) {
    sqlite.exec(`
      CREATE VIRTUAL TABLE vibe_fts USING fts5(
        title,
        content,
        mood,
        content='vibe_notes',
        content_rowid='id',
        tokenize='unicode61'
      );
      CREATE TRIGGER vibe_ai AFTER INSERT ON vibe_notes BEGIN
        INSERT INTO vibe_fts(rowid, title, content, mood)
        VALUES (new.id, COALESCE(new.title,''), new.content, COALESCE(new.mood,''));
      END;
      CREATE TRIGGER vibe_ad AFTER DELETE ON vibe_notes BEGIN
        INSERT INTO vibe_fts(vibe_fts, rowid, title, content, mood)
        VALUES ('delete', old.id, COALESCE(old.title,''), old.content, COALESCE(old.mood,''));
      END;
      CREATE TRIGGER vibe_au AFTER UPDATE ON vibe_notes BEGIN
        INSERT INTO vibe_fts(vibe_fts, rowid, title, content, mood)
        VALUES ('delete', old.id, COALESCE(old.title,''), old.content, COALESCE(old.mood,''));
        INSERT INTO vibe_fts(rowid, title, content, mood)
        VALUES (new.id, COALESCE(new.title,''), new.content, COALESCE(new.mood,''));
      END;
      INSERT INTO vibe_fts(rowid, title, content, mood)
      SELECT id, COALESCE(title,''), content, COALESCE(mood,'') FROM vibe_notes;
    `);
  } else {
    // 老 vibe_fts 不带 title 列：drop + 重建（用 DELETE/INSERT 触发器）
    sqlite.exec(`
      DROP TRIGGER IF EXISTS vibe_ai;
      DROP TRIGGER IF EXISTS vibe_ad;
      DROP TRIGGER IF EXISTS vibe_au;
      DROP TABLE IF EXISTS vibe_fts;
      CREATE VIRTUAL TABLE vibe_fts USING fts5(
        title,
        content,
        mood,
        content='vibe_notes',
        content_rowid='id',
        tokenize='unicode61'
      );
      CREATE TRIGGER vibe_ai AFTER INSERT ON vibe_notes BEGIN
        INSERT INTO vibe_fts(rowid, title, content, mood)
        VALUES (new.id, COALESCE(new.title,''), new.content, COALESCE(new.mood,''));
      END;
      CREATE TRIGGER vibe_ad AFTER DELETE ON vibe_notes BEGIN
        INSERT INTO vibe_fts(vibe_fts, rowid, title, content, mood)
        VALUES ('delete', old.id, COALESCE(old.title,''), old.content, COALESCE(old.mood,''));
      END;
      CREATE TRIGGER vibe_au AFTER UPDATE ON vibe_notes BEGIN
        INSERT INTO vibe_fts(vibe_fts, rowid, title, content, mood)
        VALUES ('delete', old.id, COALESCE(old.title,''), old.content, COALESCE(old.mood,''));
        INSERT INTO vibe_fts(rowid, title, content, mood)
        VALUES (new.id, COALESCE(new.title,''), new.content, COALESCE(new.mood,''));
      END;
      INSERT INTO vibe_fts(rowid, title, content, mood)
      SELECT id, COALESCE(title,''), content, COALESCE(mood,'') FROM vibe_notes;
    `);
  }
}

export function migrate() {
  const sqlite = getRawSqlite();
  // 1. 创建/重建表
  sqlite.exec(SCHEMA);
  // 2. 兼容升级：老库加列
  for (const m of MIGRATIONS_2_0) {
    if (!hasColumn(sqlite, m.table, m.column)) {
      try {
        sqlite.exec(m.ddl);
      } catch (err) {
        // 静默忽略；表本身是新表时，列已在 CREATE TABLE 中包含
      }
    }
  }
  // 3. FTS5 + 触发器
  ensureFts(sqlite);
  console.log('✅ Schema migrated (with FTS5 + triggers)');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}