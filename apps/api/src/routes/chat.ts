/**
 * 站内 AI 对话。
 *
 * POST /api/v1/chat/sessions      新建会话（登录用户 / 游客）
 * GET  /api/v1/chat/sessions      当前用户的会话列表
 * GET  /api/v1/chat/sessions/:id  会话详情（含消息）
 * POST /api/v1/chat/sessions/:id/messages  发送消息 → SSE 流式返回
 * DELETE /api/v1/chat/sessions/:id        删除会话
 *
 * 实现策略：
 * 1. 用 FTS5 + 中文分词检索最相关的 3-5 条文章 / Vibe 片段
 * 2. 把片段 + 用户问题组装成 grounded 回答（SSE 打字机效果逐字输出）
 * 3. 若未配 AI_API_KEY：用纯模板生成（基于片段引用 + 引导问）
 * 若配置了：将来可换成真 LLM（占位）
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { streamSSE } from 'hono/streaming';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { generateToken, visitorHash as makeVisitorHash } from '../utils/crypto.js';
import { rateLimit as takeRateLimit } from '../middleware/rate-limit.js';
import { getLlmClient, type LlmMessage } from '../services/llm.js';

export const chatRouter = new Hono();

// ----------------------------------------------------------------------------
// 复用 search 的分词 + 检索
// ----------------------------------------------------------------------------

function segment(text: string): string[] {
  try {
    const Seg = (Intl as any).Segmenter;
    if (Seg) {
      const seg = new Seg('zh', { granularity: 'word' });
      return [...seg.segment(text)]
        .map((s: any) => s.segment)
        .filter((s: string) => s.trim().length > 0);
    }
  } catch {}
  return [...text];
}

function escapeFts(q: string) {
  return q.replace(/"/g, '""');
}

/** 把多 token 拼接成 FTS5 的 OR 查询（每个 token 加前缀匹配）。 */
function buildFtsQuery(tokens: string[]): string {
  const valid = tokens
    .map((t) => t.trim())
    .filter((t) => t.length >= 1 && !/^[\s\p{P}]+$/u.test(t));
  if (valid.length === 0) return '';
  return valid.map((t) => `"${escapeFts(t)}"*`).join(' OR ');
}

type RetrievalHit = {
  type: 'post' | 'vibe';
  id: number;
  slug?: string;
  title?: string;
  excerpt: string;
  score: number;
};

function retrieve(db: any, q: string, k = 4): RetrievalHit[] {
  if (q.trim().length < 2) return [];
  const tokens = segment(q);
  const ftsLiteral = buildFtsQuery(tokens);
  if (!ftsLiteral) return [];
  const hits: RetrievalHit[] = [];

  // 用 raw sqlite（drizzle 包装对 FTS5 MATCH 的参数化传递有问题）
  const sqlite = db.$client ?? db;

  // 1) 检索 posts（snippet 取第 2 列 = content）
  try {
    const ftsRows = sqlite
      .prepare(
        `SELECT rowid, bm25(posts_fts) AS score, snippet(posts_fts, 2, '…', '…', '…', 16) AS excerpt
         FROM posts_fts WHERE posts_fts MATCH ? ORDER BY score LIMIT 20`
      )
      .all(ftsLiteral) as Array<{ rowid: number; score: number; excerpt: string }>;

    if (ftsRows.length) {
      const ids = ftsRows.map((r) => r.rowid);
      // 用 raw sqlite，drizzle 的 where(片段) + .all(...ids) 在 better-sqlite3 上不可靠
      const placeholders = ids.map(() => '?').join(',');
      const rows = sqlite
        .prepare(`SELECT id, slug, title, status FROM posts WHERE id IN (${placeholders})`)
        .all(...ids) as Array<{ id: number; slug: string; title: string; status: string }>;

      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const f of ftsRows) {
        const r = byId.get(f.rowid);
        if (r && r.status === 'published') {
          hits.push({
            type: 'post',
            id: r.id,
            slug: r.slug,
            title: r.title,
            excerpt: f.excerpt,
            score: f.score,
          });
        }
      }
    }
  } catch {}

  // 2) 检索 vibe_notes（snippet 取第 1 列 = content；vibe_fts 列序：title, content, mood）
  try {
    const ftsRows = sqlite
      .prepare(
        `SELECT rowid, bm25(vibe_fts) AS score, snippet(vibe_fts, 1, '…', '…', '…', 16) AS excerpt
         FROM vibe_fts WHERE vibe_fts MATCH ? ORDER BY score LIMIT 20`
      )
      .all(ftsLiteral) as Array<{ rowid: number; score: number; excerpt: string }>;

    if (ftsRows.length) {
      const ids = ftsRows.map((r) => r.rowid);
      const placeholders = ids.map(() => '?').join(',');
      const rows = sqlite
        .prepare(`SELECT id, title, status FROM vibe_notes WHERE id IN (${placeholders})`)
        .all(...ids) as Array<{ id: number; title: string | null; status: string }>;

      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const f of ftsRows) {
        const r = byId.get(f.rowid);
        if (r && r.status === 'published') {
          hits.push({
            type: 'vibe',
            id: r.id,
            title: r.title ?? undefined,
            excerpt: f.excerpt,
            score: f.score,
          });
        }
      }
    }
  } catch {}

  // bm25 数值越小越相关；混合后按 score 升序，截取前 k
  return hits.sort((a, b) => a.score - b.score).slice(0, k);
}

/** 从一段字符串中提取相关片段（最长 300 字，以包含关键词的句子为中心）。 */
function trimExcerpt(text: string, query: string, max = 200): string {
  if (!text) return '';
  const tokens = query.split(/\s+/).filter((t) => t.length > 1).slice(0, 3);
  let idx = -1;
  for (const tok of tokens) {
    idx = text.toLowerCase().indexOf(tok.toLowerCase());
    if (idx >= 0) break;
  }
  if (idx < 0) return text.slice(0, max) + (text.length > max ? '…' : '');
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + max);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/** 离线 grounded 回答生成（ 的降级路径）。 */
function composeAnswer(query: string, hits: RetrievalHit[]): string {
  if (hits.length === 0) {
    return [
      `关于「${query}」，我暂时没在博客里找到直接的讨论。`,
      '',
      '你可以试试：',
      '- 换个关键词或更具体的描述',
      '- 用顶部搜索框浏览相关文章',
      '- 或者让我知道你的具体困惑，我再去翻翻资料 ✦',
    ].join('\n');
  }
  const lines: string[] = [];
  lines.push(`关于「${query}」，我在博客里找到了 ${hits.length} 篇相关文章，挑了几段最相关的：`);
  lines.push('');
  hits.forEach((h, i) => {
    if (h.type === 'post') {
      lines.push(`**${i + 1}. 《${h.title ?? '（无题）'}》**`);
      lines.push(`> ${trimExcerpt(h.excerpt, query, 160)}`);
      if (h.slug) lines.push(`→ 全文：/posts/${h.slug}`);
    } else {
      lines.push(`**${i + 1}. 一条 Vibe**`);
      lines.push(`> ${trimExcerpt(h.excerpt, query, 160)}`);
    }
    lines.push('');
  });
  lines.push('以上是基于站内内容的快速摘要。如果你想要更深入的讨论，欢迎告诉我具体在哪个点上想继续 ✦');
  return lines.join('\n');
}

/** 把检索片段打包成给 LLM 的 context。 */
function buildChatPrompt(query: string, hits: RetrievalHit[]): { system: string; user: string } {
  const context = hits.length === 0
    ? '（站内没有找到直接相关的文章）'
    : hits
        .map((h, i) => {
          if (h.type === 'post') {
            return `[${i + 1}] 《${h.title ?? '（无题）'}》(/posts/${h.slug ?? ''})\n${trimExcerpt(h.excerpt, query, 400)}`;
          }
          return `[${i + 1}] Vibe：${trimExcerpt(h.excerpt, query, 400)}`;
        })
        .join('\n\n');

  return {
    system: `你是 MyBlog 的站内 AI 助手。基于用户提供的博客片段回答问题。

要求：
- 优先用片段里的内容回答；如果片段不覆盖，明确告诉用户
- 用中文回答；适当用 Markdown（标题、加粗、列表、引用）
- 引用片段时用 [1] / [2] 这种编号，最后用「参考：」列出对应标题与链接
- 控制在 400 字以内，除非用户明确要求更详细
- 不要编造片段里没有的事实`,
    user: `站内检索到的片段：

${context}

用户问题：${query}`,
  };
}

// ----------------------------------------------------------------------------
// Tool Calling: 暴露给 LLM 的「站内搜索」工具
// ----------------------------------------------------------------------------

/** search_blog 工具的 schema（OpenAI 格式） */
const SEARCH_BLOG_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_blog',
    description:
      '在 MyBlog 站内全文搜索（基于 SQLite FTS5 + 中文分词）。当你需要查博客文章或 Vibe 笔记的具体内容、确认博客是否讨论过某个主题、或者引用站内资料回答用户问题时，调用此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词；中文建议拆成 2-4 字片段以提高召回率',
        },
        type: {
          type: 'string',
          enum: ['post', 'vibe', 'all'],
          description: '检索范围：post=只文章，vibe=只笔记，all=全部（默认）',
        },
        limit: {
          type: 'number',
          description: '返回片段数量，1-10（默认 4）',
        },
      },
      required: ['query'],
    },
  },
};

/** 工具执行结果（给 LLM 的 tool 消息 + sources 给前端） */
interface ToolExecResult {
  tool_call_id: string;
  name: string;
  /** 给 LLM 的 tool 消息内容（JSON 字符串） */
toolContent: string;
  /** 前端 sources 展示用 */
sources: RetrievalHit[];
}

/** 执行 search_blog 工具 */
function execSearchBlog(args: { query: string; type?: string; limit?: number }, db: any): RetrievalHit[] {
  const type = (args.type ?? 'all') as 'post' | 'vibe' | 'all';
  const limit = Math.max(1, Math.min(args.limit ?? 4, 10));
  return retrieve(db, args.query, limit).filter((h) => type === 'all' || h.type === type);
}

/** 把 RetrievalHit 数组转成 LLM tool 消息的字符串（结构化 JSON） */
function hitsToToolMessage(hits: RetrievalHit[]): string {
  return JSON.stringify({
    count: hits.length,
    hits: hits.map((h, i) => ({
      index: i + 1,
      type: h.type,
      title: h.title ?? null,
      slug: h.slug ?? null,
      id: h.id,
      excerpt: trimExcerpt(h.excerpt ?? '', '', 200),
    })),
  });
}

// ----------------------------------------------------------------------------
// Sessions
// ----------------------------------------------------------------------------

const newSessionSchema = z.object({
  title: z.string().max(120).optional(),
});

chatRouter.post('/sessions', zValidator('json', newSessionSchema), async (c) => {
  const db = getDb();
  const user = c.get('user') as any;
  const body = c.req.valid('json');

  const id = generateToken(16);
  const now = new Date().toISOString();
  db.insert(schema.chatSessions)
    .values({
      id,
      userId: user?.id ?? null,
      visitorHash: user ? null : makeVisitorHash(c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'anon'),
      title: body.title ?? null,
      createdAt: now,
    })
    .run();
  return c.json({ ok: true, data: { id, created_at: now } });
});

chatRouter.get('/sessions', async (c) => {
  const db = getDb();
  const user = c.get('user') as any;
  const visitorHash = makeVisitorHash(c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'anon');

  const where = user
    ? eq(schema.chatSessions.userId, user.id)
    : eq(schema.chatSessions.visitorHash, visitorHash);

  const rows = db
    .select()
    .from(schema.chatSessions)
    .where(where)
    .orderBy(desc(schema.chatSessions.createdAt))
    .limit(50)
    .all();
  return c.json({ ok: true, data: rows });
});

chatRouter.get('/sessions/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const session = db.select().from(schema.chatSessions).where(eq(schema.chatSessions.id, id)).get();
  if (!session) return c.json({ ok: false, error: 'Session not found' }, 404);

  const messages = db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, id))
    .orderBy(schema.chatMessages.createdAt)
    .all();

  return c.json({ ok: true, data: { session, messages } });
});

chatRouter.delete('/sessions/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const user = c.get('user') as any;

  const session = db
    .select()
    .from(schema.chatSessions)
    .where(eq(schema.chatSessions.id, id))
    .get();
  if (!session) return c.json({ ok: false, error: 'Session not found' }, 404);

  // 权限校验：登录用户须是 owner；游客须匹配 visitor_hash
  const allowed = user
    ? session.userId === user.id
    : session.userId === null &&
      session.visitorHash ===
        makeVisitorHash(c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'anon');
  if (!allowed) return c.json({ ok: false, error: 'Forbidden' }, 403);

  db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, id)).run();
  return c.json({ ok: true, data: { id } });
});

// ----------------------------------------------------------------------------
// 发送消息（SSE 流式）
// ----------------------------------------------------------------------------

/** 落库助手消息（含 sources）并自动给会话起标题。 */
function persistAssistant(
  db: any,
  sessionId: string,
  content: string,
  sources: RetrievalHit[],
  userQuery: string,
  currentTitle: string | null,
): void {
  db.insert(schema.chatMessages)
    .values({
      sessionId,
      role: 'assistant',
      content,
      sources: JSON.stringify(
        sources.map((h) => ({ type: h.type, id: h.id, slug: h.slug, title: h.title }))
      ),
      createdAt: new Date().toISOString(),
    })
    .run();

  // 自动给会话起标题（首条消息的前 30 字）
  if (!currentTitle) {
    const title = userQuery.slice(0, 30) + (userQuery.length > 30 ? '…' : '');
    db.update(schema.chatSessions)
      .set({ title })
      .where(eq(schema.chatSessions.id, sessionId))
      .run();
  }
}

const messageSchema = z.object({
  content: z.string().min(1).max(2000),
});

chatRouter.post(
  '/sessions/:id/messages',
  zValidator('json', messageSchema),
  async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'anon';
    if (!takeRateLimit(`chat:${ip}`, 20, 60_000)) {
      return c.json({ ok: false, error: 'Too many requests, slow down.' }, 429);
    }

    const db = getDb();
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const session = db.select().from(schema.chatSessions).where(eq(schema.chatSessions.id, id)).get();
    if (!session) return c.json({ ok: false, error: 'Session not found' }, 404);

    const now = new Date().toISOString();

    // 1) 写入用户消息
    db.insert(schema.chatMessages)
      .values({
        sessionId: id,
        role: 'user',
        content: body.content,
        createdAt: now,
      })
      .run();

    // 2) 检索相关片段（grounded，初始 references）
    const initialHits = retrieve(db, body.content, 4);
    const llm = await getLlmClient();
    const fallbackAnswer = composeAnswer(body.content, initialHits);
    const { system: llmSystem, user: llmUser } = buildChatPrompt(body.content, initialHits);

    return streamSSE(c, async (stream) => {
      const msgId = `msg_${Date.now()}`;
      // 最终给用户看的内容（可能是 tool_call 链 + 最终 assistant）
      let buffer = '';
      // 工具执行累计命中的片段（用于最终 sources + 落库）
      const collectedSources: RetrievalHit[] = [...initialHits];

      // 没配 LLM → 走模板降级（保留 1.0 行为）
      if (!llm) {
        await stream.writeSSE({ event: 'sources', data: JSON.stringify(initialHits) });
        for (const ch of Array.from(fallbackAnswer)) {
          buffer += ch;
          await stream.writeSSE({ event: 'token', id: msgId, data: JSON.stringify({ delta: ch }) });
          await new Promise((r) => setTimeout(r, 12));
        }
        await persistAssistant(db, id, buffer, collectedSources, body.content, session.title);
        await stream.writeSSE({ event: 'done', data: '[DONE]' });
        return;
      }

      // ===== 真 LLM（含 tool calling 编排）=====
      // 第一轮：system + 初始检索片段 + 用户问题
      const messages: LlmMessage[] = [
        { role: 'system', content: llmSystem },
        { role: 'user', content: llmUser },
      ];

      // 先发初始 sources（前置检索的 4 段）
      await stream.writeSSE({ event: 'sources', data: JSON.stringify(initialHits) });

      // 最多 3 轮 tool_call 循环（防止无限递归）
      const MAX_TOOL_ROUNDS = 3;
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let assistantMsg: LlmMessage;
        try {
          assistantMsg = await llm.stream(
            {
              messages,
              tools: [SEARCH_BLOG_TOOL],
              tool_choice: 'auto',
              temperature: 0.5,
              max_tokens: 1024,
            },
            async (delta) => {
              buffer += delta;
              await stream.writeSSE({ event: 'token', id: msgId, data: JSON.stringify({ delta }) });
            }
          );
        } catch (err) {
          // LLM 调用失败 → 兜底模板（保证用户至少拿到回答）
          console.warn('[chat] LLM stream failed, fallback to template:', (err as Error).message);
          for (const ch of Array.from(fallbackAnswer)) {
            buffer += ch;
            await stream.writeSSE({ event: 'token', id: msgId, data: JSON.stringify({ delta: ch }) });
            await new Promise((r) => setTimeout(r, 12));
          }
          break;
        }

        // 把本轮 assistant 消息加入历史
        messages.push(assistantMsg);

        // 没有 tool_calls → 结束
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          break;
        }

        // ===== 执行所有 tool_calls =====
        for (const tc of assistantMsg.tool_calls) {
          if (tc.function.name !== 'search_blog') {
            // 未知工具 → 告诉 LLM 不支持
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify({ error: `Unknown tool: ${tc.function.name}` }),
            });
            continue;
          }
          let args: { query: string; type?: string; limit?: number };
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify({ error: 'Invalid JSON arguments' }),
            });
            continue;
          }

          // 通知前端：开始调工具
          await stream.writeSSE({
            event: 'tool_call',
            id: msgId,
            data: JSON.stringify({ id: tc.id, name: tc.function.name, arguments: args }),
          });

          // 真实执行
          const hits = execSearchBlog(args, db);
          collectedSources.push(...hits);

          const toolContent = hitsToToolMessage(hits);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: toolContent,
          });

          // 通知前端：工具结果（含来源）
          await stream.writeSSE({
            event: 'tool_result',
            id: msgId,
            data: JSON.stringify({ id: tc.id, name: tc.function.name, hits }),
          });
        }
        // 进入下一轮：LLM 基于 tool 结果继续生成
      }

      await persistAssistant(db, id, buffer, collectedSources, body.content, session.title);
      await stream.writeSSE({ event: 'done', data: '[DONE]' });
    });
  }
);