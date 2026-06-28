/**
 * @myblog/shared - MyBlog 共享的 TypeScript 类型
 * 供前端（web/admin）和后端（api）共同使用
 */

// ============================================================================
// 文章类型
// ============================================================================

export type PostStatus = 'draft' | 'published' | 'rejected';
export type PostCategory = 'tech' | 'project' | 'diary';
export type PostSourceType = 'github' | 'outline' | 'trending' | 'manual';

export interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category: PostCategory | null;
  tags: string[];
  status: PostStatus;
  sourceType: PostSourceType | null;
  sourceMeta: Record<string, unknown> | null;
  seoDescription: string | null;
  coverImageUrl: string | null;
  aiReviewFeedback: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readingTime?: number;
}

export interface PostVersion {
  id: number;
  postId: number;
  content: string;
  editedBy: 'ai' | 'admin';
  changeSummary: string | null;
  createdAt: string;
}

export interface CreatePostInput {
  title: string;
  content: string;
  source_type: PostSourceType;
  source_meta?: Record<string, unknown>;
  tags?: string[];
  category?: PostCategory;
  seo_description?: string;
  cover_image_url?: string;
}

export interface CreatePostFromGithubInput {
  repo: string;
  ref: string;
  instruction?: string;
}

export interface CreatePostFromOutlineInput {
  outline: string;
  target_audience?: string;
  tone?: 'technical' | 'casual' | 'tutorial';
}

export interface CreatePostFromTrendingInput {
  keywords: string[];
  sources?: string[];
}

export interface ReviewPostInput {
  action: 'publish' | 'reject' | 'request_revision';
  feedback?: string;
  edited_content?: string;
}

// ============================================================================
// 项目类型
// ============================================================================

export type ProjectStatus = 'active' | 'archived' | 'planned';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  techStack: string[];
  githubUrl: string | null;
  demoUrl: string | null;
  fullProjectUrl: string | null;
  changelog: string | null;
  screenshots: string[];
  status: ProjectStatus;
  sortOrder: number;
  githubMeta: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  tech_stack?: string[];
  github_url?: string;
  demo_url?: string;
  status?: ProjectStatus;
  sort_order?: number;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  full_project_url?: string;
  changelog?: string;
  screenshots?: string[];
}

// ============================================================================
// AI / 分析类型
// ============================================================================

export interface AiAuditLog {
  id: number;
  endpoint: string;
  method: string;
  payloadSummary: string | null;
  responseStatus: number;
  latencyMs: number;
  ipAddress: string | null;
  createdAt: string;
}

export interface AiContext {
  topPosts: Post[];
  tagDistribution: Record<string, number>;
  recentSearches: string[];
  totalPosts: number;
  totalProjects: number;
  draftCount: number;
}

// ============================================================================
// API 响应包装器
// ============================================================================

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// 站点配置（可公开消费）
// ============================================================================

export interface SiteConfig {
  title: string;
  tagline: string;
  description: string;
  author: {
    name: string;
    avatar: string;
    bio: string;
    skills: string[];
    socials: {
      github?: string;
      twitter?: string;
      email?: string;
      rss?: string;
    };
  };
  theme: {
    accent: string;
    radius: string;
  };
}
