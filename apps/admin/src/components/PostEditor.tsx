/**
 * 文章编辑页（/admin/posts/:id/edit 路由）。
 *
 * 完整元数据 + Markdown 正文（Tiptap）。
 * 通过 hash 路由在 SPA 内挂载，保持 AdminLayout / 登录状态。
 */
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { adminApi } from '../lib/admin-api';
import { MarkdownEditor } from './MarkdownEditor';

const CATEGORY_OPTIONS = [
  { value: 'tech', label: '技术' },
  { value: 'project', label: '项目' },
  { value: 'diary', label: '随笔' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
];

interface Props {
  postId: number | null;       // null = 新建
  onBack: () => void;          // 返回列表
}

export function PostEditor({ postId, onBack }: Props) {
  const [loading, setLoading] = useState(postId !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('tech');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');

  const load = useCallback(async () => {
    if (postId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const posts = await adminApi.listPosts();
      const p = posts.find((x: any) => x.id === postId);
      if (!p) {
        setError(`找不到文章 #${postId}`);
        return;
      }
      setTitle(p.title ?? '');
      setSlug(p.slug ?? '');
      setExcerpt(p.excerpt ?? '');
      setContent(p.content ?? '');
      setCategory(p.category ?? 'tech');
      try {
        setTags(Array.isArray(p.tags) ? p.tags : JSON.parse(p.tags || '[]'));
      } catch {
        setTags([]);
      }
      setCoverImageUrl(p.coverImageUrl ?? '');
      setSeoDescription(p.seoDescription ?? '');
      setStatus(p.status === 'published' ? 'published' : 'draft');
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput('');
  };

  const save = async (publish = false) => {
    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    if (!content.trim()) {
      setError('请填写正文');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        excerpt: excerpt.trim() || undefined,
        content,
        category,
        tags,
        cover_image_url: coverImageUrl.trim() || undefined,
        seo_description: seoDescription.trim() || undefined,
        status: publish ? 'published' : status,
      };
      if (postId === null) {
        await adminApi.createPost({
          title: payload.title,
          content: payload.content,
          category: payload.category,
          tags: payload.tags,
          seo_description: payload.seo_description,
          cover_image_url: payload.cover_image_url,
        });
      } else {
        await adminApi.updatePost(postId, payload);
      }
      setSavedAt(new Date());
    } catch (e: any) {
      setError(e.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-wider text-ink-500">
        加载文章…
      </div>
    );
  }

  const wordCount = content.replace(/<[^>]*>/g, '').length;
  const minCount = title.length > 0 && content.length > 0;

  return (
    <div className="space-y-6">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 bg-ink-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded border border-ink-700 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-ink-300 hover:border-ink-500"
          >
            ← 返回列表
          </button>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
              {postId === null ? 'NEW POST' : `EDIT POST · #${postId}`}
            </p>
            <h1 className="font-display text-xl font-medium tracking-tight">
              {title || (postId === null ? '未命名文章' : `文章 #${postId}`)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="font-mono text-[10px] text-emerald-400">
              ✓ 已保存 · {savedAt.toLocaleTimeString('zh-CN')}
            </span>
          )}
          <button
            onClick={() => save(false)}
            disabled={saving || !minCount}
            className="rounded border border-ink-700 px-4 py-1.5 font-mono text-xs hover:border-ink-500 disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存草稿'}
          </button>
          {status !== 'published' && (
            <button
              onClick={() => save(true)}
              disabled={saving || !minCount}
              className="rounded bg-accent px-4 py-1.5 font-mono text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              发布
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 font-mono text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 正文 */}
        <div className="space-y-6">
          <Field label="标题" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="一个能让人想点的标题…"
              className="input"
              maxLength={200}
            />
          </Field>

          <Field label="正文 (Markdown)" required hint={`${wordCount} 字`}>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="开始写作…支持 H1/H2/H3、粗体、斜体、列表、引用、代码块、链接、图片…"
              minHeight={520}
            />
          </Field>

          <Field label="摘要 (excerpt)">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="一句话简介，会显示在列表与 OG 卡片上（留空自动从正文截取）"
              rows={2}
              className="input"
              maxLength={300}
            />
          </Field>
        </div>

        {/* 元数据侧栏 */}
        <aside className="space-y-5">
          <Section title="状态">
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value as any)}
                  className={`flex-1 rounded border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
                    status === s.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-ink-700 text-ink-400 hover:border-ink-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="分类">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Section>

          <Section title="标签">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-xs"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="text-ink-400 hover:text-red-400"
                    aria-label={`移除 ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(tagInput);
                }
                if (e.key === 'Backspace' && !tagInput && tags.length) {
                  setTags(tags.slice(0, -1));
                }
              }}
              placeholder="按 Enter 添加"
              className="input"
            />
          </Section>

          <Section title="Slug (URL 路径)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="留空自动生成"
              className="input font-mono text-xs"
            />
          </Section>

          <Section title="封面图 URL">
            <input
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://…"
              className="input font-mono text-xs"
            />
            {coverImageUrl && (
              <img
                src={coverImageUrl}
                alt=""
                className="mt-2 max-h-32 rounded border border-ink-700"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
          </Section>

          <Section title="SEO 描述">
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder="搜索引擎与社交分享时显示的描述"
              rows={2}
              className="input"
              maxLength={300}
            />
            <p className="mt-1 font-mono text-[10px] text-ink-500">
              {seoDescription.length}/300
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}

// ----- helpers -----
function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
          {label}
          {required && <span className="ml-1 text-accent">*</span>}
        </span>
        {hint && <span className="font-mono text-[10px] text-ink-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-800 bg-ink-900/40 p-4">
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-ink-500">
        {title}
      </h3>
      {children}
    </section>
  );
}
