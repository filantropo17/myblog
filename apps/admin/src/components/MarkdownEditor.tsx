/**
 * Tiptap Markdown 编辑器（admin 通用）。
 *
 * 工具栏：
 * H1 / H2 / H3 / 段落
 * 粗体 / 斜体 / 删除线 / 行内代码
 * 有序列表 / 无序列表 / 任务列表
 * 引用 / 代码块（带语言）
 * 链接 / 图片 / 分割线
 * 撤销 / 重做
 * 预览切换（右侧实时渲染）
 *
 * 输出：HTML（保存到数据库前由后端 normalize 成 Markdown）
 */
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useState } from 'react';

export interface MarkdownEditorProps {
  value: string;                       // HTML（来源 / 初始值）
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;                  // px
  maxLength?: number;                  // 字符上限（0 = 不限）
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = '开始写作…',
  minHeight = 420,
  maxLength = 0,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [linkPrompt, setLinkPrompt] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imagePrompt, setImagePrompt] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: 'language-*' } },
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } },
      }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg' } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none px-6 py-5',
        style: `min-height: ${minHeight}px;`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // 外部 value 变化时同步（如「加载草稿」）
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="rounded-lg border border-ink-700 bg-ink-950 p-6 text-sm text-ink-500">
        加载编辑器…
      </div>
    );
  }

  const charCount = editor.getText().length;
  const overLimit = maxLength > 0 && charCount > maxLength;

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950 overflow-hidden">
      <Toolbar
        editor={editor}
        showPreview={showPreview}
        togglePreview={() => setShowPreview((s) => !s)}
        openLink={() => {
          setLinkUrl(editor.getAttributes('link').href ?? '');
          setLinkPrompt(true);
        }}
        openImage={() => {
          setImageUrl('');
          setImagePrompt(true);
        }}
      />

      <div className={showPreview ? 'grid grid-cols-2 divide-x divide-ink-800' : ''}>
        <div className={showPreview ? 'overflow-auto' : ''}>
          <EditorContent editor={editor} />
        </div>
        {showPreview && (
          <div
            className="prose prose-invert max-w-none overflow-auto bg-ink-900/30 px-6 py-5"
            style={{ minHeight }}
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-ink-800 bg-ink-900/40 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-500">
        <span>
          {editor.storage.characterCount?.characters() ?? charCount}
          {maxLength > 0 ? ` / ${maxLength}` : ''} 字
        </span>
        {overLimit && <span className="text-red-400">超出字数上限</span>}
        <span>{editor.getText().split(/\s+/).filter(Boolean).length} 词</span>
      </footer>

      {linkPrompt && (
        <PromptDialog
          title="插入链接"
          label="URL"
          value={linkUrl}
          onChange={setLinkUrl}
          onCancel={() => setLinkPrompt(false)}
          onSubmit={() => {
            if (linkUrl.trim()) {
              editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
            } else {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
            }
            setLinkPrompt(false);
          }}
        />
      )}

      {imagePrompt && (
        <PromptDialog
          title="插入图片"
          label="图片 URL"
          value={imageUrl}
          onChange={setImageUrl}
          onCancel={() => setImagePrompt(false)}
          onSubmit={() => {
            if (imageUrl.trim()) {
              editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
            }
            setImagePrompt(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 工具栏
// ---------------------------------------------------------------------------

interface ToolbarProps {
  editor: Editor;
  showPreview: boolean;
  togglePreview: () => void;
  openLink: () => void;
  openImage: () => void;
}

function Toolbar({ editor, showPreview, togglePreview, openLink, openImage }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-ink-800 bg-ink-900/40 p-2 font-mono text-xs">
      {/* 块级 */}
      <Group>
        <Btn label="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="标题 1" />
        <Btn label="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="标题 2" />
        <Btn label="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="标题 3" />
        <Btn label="¶" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} title="段落" />
      </Group>

      <Divider />

      {/* 行内 */}
      <Group>
        <Btn label="B" bold active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="粗体" />
        <Btn label="I" italic active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体" />
        <Btn label="S" strike active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="删除线" />
        <Btn label="</>" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="行内代码" />
      </Group>

      <Divider />

      {/* 列表 */}
      <Group>
        <Btn label="•" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表" />
        <Btn label="1." active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="有序列表" />
        <Btn label="☐" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="任务列表" />
      </Group>

      <Divider />

      {/* 块级补充 */}
      <Group>
        <Btn label="❝" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用" />
        <Btn label="{}" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="代码块" />
        <Btn label="—" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分割线" />
      </Group>

      <Divider />

      {/* 媒体 */}
      <Group>
        <Btn label="🔗" active={editor.isActive('link')} onClick={openLink} title="链接" />
        <Btn label="🖼" onClick={openImage} title="图片" />
      </Group>

      <Divider />

      {/* 历史 */}
      <Group>
        <Btn label="↶" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销" />
        <Btn label="↷" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做" />
      </Group>

      <div className="ml-auto" />
      <Btn label={showPreview ? '✎ 仅编辑' : '👁 预览'} active={showPreview} onClick={togglePreview} title="切换预览" />
    </div>
  );
}

interface BtnProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}

function Btn({ label, onClick, active, disabled, title, bold, italic, strike }: BtnProps) {
  const style: React.CSSProperties = {};
  if (bold) style.fontWeight = 600;
  if (italic) style.fontStyle = 'italic';
  if (strike) style.textDecoration = 'line-through';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
      className={`min-w-[2rem] rounded px-2 py-1 text-ink-300 transition-colors hover:bg-ink-800 disabled:opacity-30 ${
        active ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : ''
      }`}
    >
      {label}
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-ink-800" />;
}

// ---------------------------------------------------------------------------
// 链接 / 图片输入弹窗（原生 dialog）
// ---------------------------------------------------------------------------

interface PromptProps {
  title: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function PromptDialog({ title, label, value, onChange, onCancel, onSubmit }: PromptProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-ink-700 bg-ink-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-display text-lg font-medium">{title}</h3>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ink-400">
          {label}
        </label>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
            if (e.key === 'Escape') onCancel();
          }}
          className="input mb-4"
          placeholder="https://…"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn btn-secondary">
            取消
          </button>
          <button onClick={onSubmit} className="btn btn-primary">
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
