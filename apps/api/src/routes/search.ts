/**
 * 全文搜索路由。
 *
 * GET /api/v1/search
 * ?q=...&type=post|vibe|all&tag=&category=&author=&from=&to=&page=&limit=
 *
 * 底层使用 SQLite FTS5 + 中文分词（Intl.Segmenter）。
 */
import { Hono } from 'hono';
import { getDb, schema } from '../db/index.js';

export const searchRouter = new Hono();

const MAX_LIMIT = 50;

/** 中文分词：用空格连接便于 FTS5 unicode61 tokenizer 命中。 */
function segment(text: string): string {
  // Node 18+ 内置 Intl.Segmenter
  try {
    // @ts-ignore - Intl.Segmenter 在某些 lib 下未声明
    const Seg = (Intl as any).Segmenter;
    if (Seg) {
      const seg = new Seg('zh', { granularity: 'word' });
      return [...seg.segment(text)]
        .map((s: any) => s.segment)
        .filter((s: string) => s.trim().length > 0)
        .join(' ');
    }
  } catch {}
  // 退化：单字符分词（最差但能用）
  return [...text].join(' ');
}

function escapeFts(q: string) {
  // FTS5 语法：双引号包裹字面量
  return q.replace(/"/g, '""');
}

/** 高亮：返回带 <mark> 标记的片段（最多 200 字）。 */
function highlight(text: string, query: string): string {
  if (!query.trim()) return text.slice(0, 200);
  const tokens = query
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (tokens.length === 0) return text.slice(0, 200);
  const re = new RegExp(`(${tokens.join('|')})`, 'gi');
  const highlighted = text.replace(re, '<mark>$1</mark>');
  // 截到第一个 mark 前后 100 字
  const idx = highlighted.indexOf('<mark>');
  if (idx < 0) return highlighted.slice(0, 200) + (highlighted.length > 200 ? '…' : '');
  const start = Math.max(0, idx - 60);
  const end = Math.min(highlighted.length, idx + 200);
  return (start > 0 ? '…' : '') + highlighted.slice(start, end) + (end < highlighted.length ? '…' : '');
}

searchRouter.get('/', async (c) => {
  const db = getDb();
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2 || q.length > 100) {
    return c.json({ ok: false, error: 'q must be 2-100 chars' }, 400);
  }
  const type = c.req.query('type') ?? 'all';
  const tag = c.req.query('tag');
  const category = c.req.query('category');
  const author = c.req.query('author');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), MAX_LIMIT);
  const offset = (page - 1) * limit;

  const segQ = segment(q);
  const ftsLiteral = `"${escapeFts(segQ)}"*`; // 模糊前缀
  const results: any[] = [];
  let total = 0;

  if (type === 'post' || type === 'all') {
    // FTS5 检索
    let ftsRows: any[];
    try {
      ftsRows = db
        .prepare(
          `SELECT rowid, bm25(posts_fts) AS score, snippet(posts_fts, 2, '<mark>', '</mark>', '…', 32) AS snippet
           FROM posts_fts WHERE posts_fts MATCH ? ORDER BY score LIMIT 200`
        )
        .all(ftsLiteral) as any[];
    } catch {
      ftsRows = [];
    }

    if (ftsRows.length) {
      const ids = ftsRows.map((r) => r.rowid);
      // 用占位 IN
      const placeholders = ids.map(() => '?').join(',');
      const rows = db
        .select()
        .from(schema.posts)
        .where(`id IN (${placeholders})`)
        .all(...ids) as any[];

      const byId = new Map(rows.map((r) => [r.id, r]));
      const scoreById = new Map(ftsRows.map((r) => [r.rowid, r.score]));

      const filtered = rows
        .filter((r) => {
          if (r.status !== 'published') return false;
          if (category && r.category !== category) return false;
          if (author && r.authorId !== Number(author)) return false;
          if (from && r.publishedAt && r.publishedAt < from) return false;
          if (to && r.publishedAt && r.publishedAt > to + 'T23:59:59') return false;
          if (tag) {
            try {
              const tags = JSON.parse(r.tags) as string[];
              if (!tags.includes(tag)) return false;
            } catch {
              return false;
            }
          }
          return true;
        })
        .map((r) => ({
          type: 'post',
          id: r.id,
          slug: r.slug,
          title: highlight(r.title, q),
          excerpt: highlight(r.excerpt ?? r.content.slice(0, 200), q),
          tags: JSON.parse(r.tags ?? '[]') as string[],
          category: r.category,
          published_at: r.publishedAt,
          score: scoreById.get(r.id) ?? 0,
          cover_image_url: r.coverImageUrl,
        }));

      // 排序：score 越低越相关（bm25 距离）
      filtered.sort((a, b) => a.score - b.score);
      total += filtered.length;
      results.push(...filtered.slice(offset, offset + limit));
    }
  }

  if (type === 'vibe' || type === 'all') {
    let ftsRows: any[];
    try {
      ftsRows = db
        .prepare(
          `SELECT rowid, bm25(vibe_fts) AS score FROM vibe_fts WHERE vibe_fts MATCH ? ORDER BY score LIMIT 200`
        )
        .all(ftsLiteral) as any[];
    } catch {
      ftsRows = [];
    }
    if (ftsRows.length) {
      const ids = ftsRows.map((r) => r.rowid);
      const placeholders = ids.map(() => '?').join(',');
      const rows = db
        .select()
        .from(schema.vibeNotes)
        .where(`id IN (${placeholders})`)
        .all(...ids) as any[];
      const scoreById = new Map(ftsRows.map((r) => [r.rowid, r.score]));

      const filtered = rows
        .filter((r) => r.status === 'published')
        .map((r) => ({
          type: 'vibe',
          id: r.id,
          title: highlight(r.content.slice(0, 60), q),
          excerpt: highlight(r.content, q),
          mood: r.mood,
          published_at: r.createdAt,
          score: scoreById.get(r.id) ?? 0,
        }));
      filtered.sort((a, b) => a.score - b.score);
      total += filtered.length;
      if (type === 'vibe') {
        results.length = 0;
        results.push(...filtered.slice(offset, offset + limit));
      } else {
        results.push(...filtered.slice(0, Math.max(0, limit - results.length)));
      }
    }
  }

  // Facets
  const tagsFacet = db
    .prepare(
      `SELECT json_each.value AS slug, count(*) AS count FROM posts, json_each(posts.tags)
       WHERE posts.status='published' GROUP BY json_each.value ORDER BY count DESC LIMIT 20`
    )
    .all() as Array<{ slug: string; count: number }>;

  const catsFacet = db
    .prepare(
      `SELECT category AS slug, count(*) AS count FROM posts WHERE status='published' GROUP BY category`
    )
    .all() as Array<{ slug: string; count: number }>;

  return c.json({
    ok: true,
    data: {
      total,
      page,
      limit,
      results,
      facets: {
        tags: tagsFacet,
        categories: catsFacet,
        types: [
          { slug: 'post', count: type === 'all' || type === 'post' ? results.filter((r) => r.type === 'post').length : 0 },
          { slug: 'vibe', count: type === 'all' || type === 'vibe' ? results.filter((r) => r.type === 'vibe').length : 0 },
        ],
      },
    },
  });
});