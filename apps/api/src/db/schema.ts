import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// 用户与会话// ============================================================================

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    role: text('role', { enum: ['admin', 'editor', 'author', 'reader'] })
      .default('reader')
      .notNull(),
    bio: text('bio'),
    status: text('status', { enum: ['active', 'suspended', 'deleted'] })
      .default('active')
      .notNull(),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    emailIdx: index('idx_users_email').on(t.email),
    usernameIdx: index('idx_users_username').on(t.username),
  })
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    userIdx: index('idx_sessions_user').on(t.userId),
    expiresIdx: index('idx_sessions_expires').on(t.expiresAt),
  })
);

// ============================================================================
// 文章（1.0 + / 新增列）
// ============================================================================

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    content: text('content').notNull(),
    excerpt: text('excerpt'),
    category: text('category', { enum: ['tech', 'project', 'diary'] }),
    tags: text('tags').default('[]').notNull(),
    status: text('status', { enum: ['draft', 'published', 'rejected'] })
      .default('draft')
      .notNull(),
    sourceType: text('source_type', { enum: ['github', 'outline', 'trending', 'manual'] }),
    sourceMeta: text('source_meta'),
    seoDescription: text('seo_description'),
    coverImageUrl: text('cover_image_url'),
    aiReviewFeedback: text('ai_review_feedback'),
    publishedAt: text('published_at'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    // 智能摘要
    keyPoints: text('key_points').default('[]').notNull(),
    readingTimeMinutes: integer('reading_time_minutes'),
    // 写操作归属
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    // 阅读量缓存
    viewCount: integer('view_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
  },
  (t) => ({
    statusIdx: index('idx_posts_status').on(t.status),
    slugIdx: index('idx_posts_slug').on(t.slug),
    categoryIdx: index('idx_posts_category').on(t.category),
    authorIdx: index('idx_posts_author').on(t.authorId),
    publishedIdx: index('idx_posts_published').on(t.publishedAt),
  })
);

export const postVersions = sqliteTable('post_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  editedBy: text('edited_by', { enum: ['ai', 'admin', 'user'] }).notNull(),
  editedById: integer('edited_by_id').references(() => users.id, { onDelete: 'set null' }),
  changeSummary: text('change_summary'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ============================================================================
// Vibe 笔记// ============================================================================

export const vibeNotes = sqliteTable(
  'vibe_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title'),
    content: text('content').notNull(),
    mood: text('mood', {
      enum: ['happy', 'think', 'angry', 'tired', 'inspired', 'chill'],
    }),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['draft', 'published', 'hidden'] })
      .default('published')
      .notNull(),
    pinned: integer('pinned').default(0).notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    commentCount: integer('comment_count').default(0).notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    statusCreatedIdx: index('idx_vibe_status_created').on(t.status, t.createdAt),
    authorIdx: index('idx_vibe_author').on(t.authorId),
    moodIdx: index('idx_vibe_mood').on(t.mood),
  })
);

// ============================================================================
// 项目（1.0 + 新增列）
// ============================================================================

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    description: text('description'),
    techStack: text('tech_stack').default('[]').notNull(),
    githubUrl: text('github_url'),
    demoUrl: text('demo_url'),
    fullProjectUrl: text('full_project_url'),
    changelog: text('changelog'),
    screenshots: text('screenshots').default('[]').notNull(),
    status: text('status', { enum: ['active', 'archived', 'planned'] })
      .default('active')
      .notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    githubMeta: text('github_meta'),
    lastSyncedAt: text('last_synced_at'),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    statusIdx: index('idx_projects_status').on(t.status),
  })
);

// ============================================================================
// 标签// ============================================================================

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    postCount: integer('post_count').default(0).notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    slugIdx: index('idx_tags_slug').on(t.slug),
  })
);

export const postTags = sqliteTable(
  'post_tags',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: uniqueIndex('pk_post_tags').on(t.postId, t.tagId),
    tagIdx: index('idx_post_tags_tag').on(t.tagId),
  })
);

// ============================================================================
// 评论// ============================================================================

export const comments = sqliteTable(
  'comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['post', 'vibe'] }).notNull(),
    targetId: integer('target_id').notNull(),
    parentId: integer('parent_id'),
    authorName: text('author_name').notNull(),
    authorEmail: text('author_email'),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    authorRole: text('author_role'),
    content: text('content').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'spam', 'rejected'] })
      .default('pending')
      .notNull(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    targetIdx: index('idx_comments_target').on(t.targetType, t.targetId, t.createdAt),
    parentIdx: index('idx_comments_parent').on(t.parentId),
    statusIdx: index('idx_comments_status').on(t.status),
  })
);

// ============================================================================
// 点赞 / 反应// ============================================================================

export const reactions = sqliteTable(
  'reactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['post', 'vibe', 'comment'] }).notNull(),
    targetId: integer('target_id').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    visitorHash: text('visitor_hash'),
    reaction: text('reaction', { enum: ['like', 'love', 'insightful'] })
      .default('like')
      .notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    targetIdx: index('idx_reactions_target').on(t.targetType, t.targetId),
    uniqUser: uniqueIndex('uniq_reaction_user').on(t.targetType, t.targetId, t.userId, t.reaction),
    uniqVisitor: uniqueIndex('uniq_reaction_visitor').on(
      t.targetType,
      t.targetId,
      t.visitorHash,
      t.reaction
    ),
  })
);

// ============================================================================
// 阅读量// ============================================================================

export const pageViews = sqliteTable(
  'page_views',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['post', 'vibe', 'page'] }).notNull(),
    targetId: integer('target_id'),
    path: text('path').notNull(),
    visitorHash: text('visitor_hash').notNull(),
    userAgent: text('user_agent'),
    referer: text('referer'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    country: text('country'),
    readDurationMs: integer('read_duration_ms').default(0).notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    targetIdx: index('idx_views_target').on(t.targetType, t.targetId, t.createdAt),
    pathDateIdx: index('idx_views_path_date').on(t.path, t.createdAt),
    visitorIdx: index('idx_views_visitor').on(t.visitorHash, t.createdAt),
  })
);

// ============================================================================
// 订阅者// ============================================================================

export const subscribers = sqliteTable(
  'subscribers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    confirmToken: text('confirm_token').notNull(),
    confirmedAt: text('confirmed_at'),
    unsubscribeToken: text('unsubscribe_token').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'unsubscribed'] })
      .default('pending')
      .notNull(),
    source: text('source'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    emailIdx: index('idx_subscribers_email').on(t.email),
  })
);

// ============================================================================
// AI 站内对话// ============================================================================

export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    visitorHash: text('visitor_hash'),
    title: text('title'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    userIdx: index('idx_chat_sessions_user').on(t.userId),
  })
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    sources: text('sources'),
    tokensUsed: integer('tokens_used'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    sessionIdx: index('idx_chat_messages_session').on(t.sessionId, t.createdAt),
  })
);

// ============================================================================
// AI 审计日志（1.0）
// ============================================================================

export const aiAuditLogs = sqliteTable(
  'ai_audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    endpoint: text('endpoint').notNull(),
    method: text('method').notNull(),
    payloadSummary: text('payload_summary'),
    responseStatus: integer('response_status').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    ipAddress: text('ip_address'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (t) => ({
    createdIdx: index('idx_audit_created').on(t.createdAt),
  })
);

// ============================================================================
// 设置
// ============================================================================

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ============================================================================
// 类型推导
// ============================================================================

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type AuditRow = typeof aiAuditLogs.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type VibeRow = typeof vibeNotes.$inferSelect;
export type NewVibeRow = typeof vibeNotes.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;
export type ReactionRow = typeof reactions.$inferSelect;
export type PageViewRow = typeof pageViews.$inferSelect;
export type SubscriberRow = typeof subscribers.$inferSelect;
export type ChatSessionRow = typeof chatSessions.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;