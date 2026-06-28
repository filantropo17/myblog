/**
 * 项目卡片 —— 3D 倾斜 + 发光 + 状态徽标。
 */
import { motion } from 'framer-motion';
import { TiltCard } from './MagneticCard';

interface ProjectCardProps {
  project: {
    id: number;
    name: string;
    description?: string | null;
    techStack?: string[];
    githubUrl?: string | null;
    demoUrl?: string | null;
    status?: 'active' | 'archived' | 'planned';
  };
  index?: number;
}

const statusMap = {
  active: { label: '进行中', color: '#10b981', pulse: true },
  archived: { label: '已归档', color: '#9c8e72', pulse: false },
  planned: { label: '计划中', color: '#f59e0b', pulse: true },
} as const;

export function ProjectCard({ project, index = 0 }: ProjectCardProps) {
  const status = statusMap[project.status ?? 'active'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.7, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="group"
      style={{ perspective: '1000px' }}
    >
      <TiltCard maxTilt={6}>
        <article className="card relative h-full overflow-hidden border-[var(--border)] bg-[var(--bg-soft)] p-7 transition-all duration-500 hover:border-[var(--accent)]/40 hover:shadow-[0_30px_80px_-30px_var(--accent)]">
          {/* 细腻的极光强调线条 */}
          <div className="absolute right-0 top-0 h-px w-32 bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

          <div className="relative flex h-full flex-col">
            <header className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg border border-[var(--border-strong)]"
                  style={{
                    background: `linear-gradient(135deg, ${status.color}30, transparent 70%)`,
                  }}
                />
                <div>
                  <h3 className="font-display text-xl font-medium tracking-tight md:text-2xl">
                    {project.name}
                  </h3>
                  <a
                    href={project.githubUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)] hover:text-[var(--accent)]"
                    data-cursor="hover"
                  >
                    {project.githubUrl
                      ? project.githubUrl.replace(/^https?:\/\//, '')
                      : '未开源'}
                  </a>
                </div>
              </div>
              <span
                className="badge whitespace-nowrap"
                style={{ color: status.color }}
              >
                <span
                  className="badge-dot"
                  style={{ animation: status.pulse ? undefined : 'none' }}
                />
                {status.label}
              </span>
            </header>

            {project.description && (
              <p className="mb-6 text-sm leading-relaxed text-[var(--ink-soft)] text-pretty md:text-base">
                {project.description}
              </p>
            )}

            <div className="mt-auto space-y-5">
              <div className="flex flex-wrap gap-1.5">
                {(project.techStack ?? []).map((tech, i) => (
                  <span
                    key={tech}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-soft)] transition-all hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
                    style={{ transitionDelay: `${i * 20}ms` }}
                  >
                    {tech}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                {project.demoUrl && (
                  <a
                    href={project.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary !px-4 !py-2 !text-xs"
                    data-cursor="hover"
                  >
                    <span>在线演示</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 17L17 7M7 7h10v10" />
                    </svg>
                  </a>
                )}
                {project.githubUrl && (
                  <a
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn !px-4 !py-2 !text-xs"
                    data-cursor="hover"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                    <span>源码</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* 对角光泽 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            style={{
              background:
                'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)',
              transform: 'translateX(-100%)',
              animation: 'sheen 1.4s ease-out forwards',
            }}
          />
        </article>
      </TiltCard>
      <style>{`
        @keyframes sheen { to { transform: translateX(100%); } }
      `}</style>
    </motion.div>
  );
}
