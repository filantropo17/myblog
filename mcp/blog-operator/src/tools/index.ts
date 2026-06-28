/**
 * 12 个 MCP 工具 —— 全部走 BlogClient → /api/mcp/* → 已有后端。
 */
import { z } from 'zod';
import type { BlogClient } from '../client.js';

// ----------------------------------------------------------------------------
// 草稿：列表 / 详情 / 创建
// ----------------------------------------------------------------------------

export const listDraftsInput = z.object({
  status: z.enum(['draft', 'published', 'rejected']).default('draft').describe('过滤状态'),
  source_type: z.enum(['github', 'outline', 'trending', 'manual']).optional().describe('按来源类型过滤'),
  limit: z.number().int().min(1).max(200).default(50),
});
export async function listDrafts(client: BlogClient, input: z.infer<typeof listDraftsInput>) {
  const params = new URLSearchParams();
  params.set('status', input.status);
  if (input.source_type) params.set('source_type', input.source_type);
  params.set('limit', String(input.limit));
  const res = await client.get<{ ok: boolean; data: any[] }>(`/api/mcp/drafts?${params}`);
  return { count: res.data.length, drafts: res.data };
}

export const getDraftInput = z.object({ id: z.number().int().describe('草稿 ID') });
export async function getDraft(client: BlogClient, input: z.infer<typeof getDraftInput>) {
  const res = await client.get<{ ok: boolean; data: any }>(`/api/mcp/drafts/${input.id}`);
  return res.data;
}

export const createDraftFromGithubInput = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).describe('owner/name，例如 vercel/next.js'),
  ref: z.string().min(1).describe('分支名 / commit sha / PR 编号'),
  instruction: z.string().max(2000).optional().describe('补充指令'),
});
export async function createDraftFromGithub(
  client: BlogClient,
  input: z.infer<typeof createDraftFromGithubInput>
) {
  const res = await client.post<{ ok: boolean; data: any }>('/api/mcp/drafts/from-github', input);
  return { id: res.data.id, title: res.data.title, status: res.data.status, slug: res.data.slug };
}

export const createDraftFromOutlineInput = z.object({
  outline: z.string().min(1).max(10000).describe('大纲文本，每行一个分节'),
  target_audience: z.string().optional().describe('目标读者，例：初学者 / 资深开发者'),
  tone: z.enum(['technical', 'casual', 'tutorial']).optional(),
});
export async function createDraftFromOutline(
  client: BlogClient,
  input: z.infer<typeof createDraftFromOutlineInput>
) {
  const res = await client.post<{ ok: boolean; data: any }>('/api/mcp/drafts/from-outline', input);
  return { id: res.data.id, title: res.data.title, status: res.data.status, slug: res.data.slug };
}

export const createDraftFromTrendingInput = z.object({
  keywords: z.array(z.string()).min(1).max(10).describe('关键词数组'),
  sources: z.array(z.string()).optional().describe('信息源链接'),
});
export async function createDraftFromTrending(
  client: BlogClient,
  input: z.infer<typeof createDraftFromTrendingInput>
) {
  const res = await client.post<{ ok: boolean; data: any }>('/api/mcp/drafts/from-trending', input);
  return { id: res.data.id, title: res.data.title, status: res.data.status, slug: res.data.slug };
}

// ----------------------------------------------------------------------------
// 草稿：审核
// ----------------------------------------------------------------------------

export const reviewDraftInput = z.object({
  id: z.number().int().describe('草稿 ID'),
  action: z.enum(['publish', 'reject', 'request_revision']).describe('publish=发布 / reject=拒绝 / request_revision=打回修改'),
  feedback: z.string().optional().describe('审核意见，reject / request_revision 时建议填'),
  edited_content: z.string().optional().describe('修改后的正文，publish 时可一并提交'),
});
export async function reviewDraft(client: BlogClient, input: z.infer<typeof reviewDraftInput>) {
  const { id, ...body } = input;
  const res = await client.post<{ ok: boolean; data: any }>(`/api/mcp/drafts/${id}/review`, body);
  return { id: res.data.id, status: res.data.status, published_at: res.data.publishedAt };
}

// ----------------------------------------------------------------------------
// 文章
// ----------------------------------------------------------------------------

export const listRecentPostsInput = z.object({
  status: z.enum(['draft', 'published', 'rejected']).default('published'),
  limit: z.number().int().min(1).max(100).default(20),
});
export async function listRecentPosts(
  client: BlogClient,
  input: z.infer<typeof listRecentPostsInput>
) {
  const params = new URLSearchParams();
  params.set('status', input.status);
  params.set('limit', String(input.limit));
  const res = await client.get<{ ok: boolean; data: any[] }>(`/api/mcp/posts?${params}`);
  return {
    count: res.data.length,
    posts: res.data.map((p: any) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      view_count: p.viewCount,
      updated_at: p.updatedAt,
    })),
  };
}

export const updatePostInput = z.object({
  id: z.number().int().describe('文章 ID'),
  title: z.string().max(200).optional(),
  content: z.string().optional().describe('修改后的正文（会落版本历史）'),
  excerpt: z.string().optional(),
  category: z.enum(['tech', 'project', 'diary']).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'rejected']).optional(),
  seo_description: z.string().max(300).optional(),
  cover_image_url: z.string().optional(),
});
export async function updatePost(client: BlogClient, input: z.infer<typeof updatePostInput>) {
  const { id, ...body } = input;
  const res = await client.patch<{ ok: boolean; data: any }>(`/api/mcp/posts/${id}`, body);
  return { id: res.data.id, status: res.data.status, updated_at: res.data.updatedAt };
}

// ----------------------------------------------------------------------------
// 评论
// ----------------------------------------------------------------------------

export const listPendingCommentsInput = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'spam']).default('pending'),
});
export async function listPendingComments(
  client: BlogClient,
  input: z.infer<typeof listPendingCommentsInput>
) {
  const res = await client.get<{ ok: boolean; data: any[] }>(
    `/api/mcp/comments?status=${input.status}`
  );
  return {
    count: res.data.length,
    comments: res.data.map((c: any) => ({
      id: c.id,
      author: c.authorName,
      content: c.content,
      target_type: c.targetType,
      target_id: c.targetId,
      created_at: c.createdAt,
    })),
  };
}

export const moderateCommentInput = z.object({
  id: z.number().int().describe('评论 ID'),
  action: z.enum(['approve', 'reject', 'spam']),
});
export async function moderateComment(
  client: BlogClient,
  input: z.infer<typeof moderateCommentInput>
) {
  const { id, action } = input;
  const res = await client.post<{ ok: boolean; data: any }>(
    `/api/mcp/comments/${id}/moderate`,
    { action }
  );
  return res.data;
}

// ----------------------------------------------------------------------------
// 分析
// ----------------------------------------------------------------------------

export const getAnalyticsSummaryInput = z.object({}).strict();
export async function getAnalyticsSummary(
  client: BlogClient,
  _input: z.infer<typeof getAnalyticsSummaryInput>
) {
  const res = await client.get<{ ok: boolean; data: any }>('/api/mcp/analytics');
  return res.data;
}

// ----------------------------------------------------------------------------
// 工具定义（给 MCP Server 注册用）
// ----------------------------------------------------------------------------

export const toolDefinitions = [
  {
    name: 'list_drafts',
    description: '列出博客草稿（默认 status=draft）。可用于定期拉取待审任务。',
    inputSchema: listDraftsInput,
    handler: listDrafts,
  },
  {
    name: 'get_draft',
    description: '获取一篇草稿的完整内容（含 source_meta 解析后的 AI 原始输入）。',
    inputSchema: getDraftInput,
    handler: getDraft,
  },
  {
    name: 'create_draft_from_github',
    description: '基于 GitHub 仓库的分支/commit/PR 生成一篇技术草稿。',
    inputSchema: createDraftFromGithubInput,
    handler: createDraftFromGithub,
  },
  {
    name: 'create_draft_from_outline',
    description: '基于大纲文本扩写成一篇草稿。',
    inputSchema: createDraftFromOutlineInput,
    handler: createDraftFromOutline,
  },
  {
    name: 'create_draft_from_trending',
    description: '基于关键词 + 信息源生成热点综述草稿。',
    inputSchema: createDraftFromTrendingInput,
    handler: createDraftFromTrending,
  },
  {
    name: 'review_draft',
    description: '审核草稿：publish 发布 / reject 拒绝 / request_revision 打回修改。',
    inputSchema: reviewDraftInput,
    handler: reviewDraft,
  },
  {
    name: 'list_recent_posts',
    description: '列出最近发布的文章（默认 status=published）。',
    inputSchema: listRecentPostsInput,
    handler: listRecentPosts,
  },
  {
    name: 'update_post',
    description: '编辑已存在的文章（修改 content 会落版本历史）。',
    inputSchema: updatePostInput,
    handler: updatePost,
  },
  {
    name: 'list_pending_comments',
    description: '列出待审评论（默认 status=pending）。',
    inputSchema: listPendingCommentsInput,
    handler: listPendingComments,
  },
  {
    name: 'moderate_comment',
    description: '审核单条评论：approve / reject / spam。',
    inputSchema: moderateCommentInput,
    handler: moderateComment,
  },
  {
    name: 'get_analytics_summary',
    description: '拉取博客核心运营指标：今日 PV、本周 PV、文章数、待审草稿数、订阅者数、Top5 文章。',
    inputSchema: getAnalyticsSummaryInput,
    handler: getAnalyticsSummary,
  },
] as const;
