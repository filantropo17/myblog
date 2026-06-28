import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

// 从仓库根 .env 读 PUBLIC_* 变量
// 优先级：根 .env → 局部 apps/web/.env（后者覆盖）
const here = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(here, '../../.env');
const localEnvPath = resolve(here, '.env');

const rootEnv: Record<string, string> = {};
if (existsSync(rootEnvPath)) {
  // dotenv parse 不写入 process.env，便于隔离
  const parsed = loadEnv({ path: rootEnvPath, quiet: true, processEnv: {} as any });
  Object.assign(rootEnv, parsed);
}
if (existsSync(localEnvPath)) {
  const parsed = loadEnv({ path: localEnvPath, quiet: true, processEnv: {} as any });
  Object.assign(rootEnv, parsed);
}

export default defineConfig({
  site: 'http://localhost:4321',
  output: 'static',
  // 关闭 dev mode 自动注入的 Astro Dev Toolbar（屏幕底部中央的开发工具）
  // 生产 build 不会显示，但开发时也想去掉以免挡页面
  devToolbar: {
    enabled: false,
  },
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  vite: {
    define: {
      __AUTHOR_NAME__: JSON.stringify(rootEnv.AUTHOR_NAME ?? rootEnv.PUBLIC_AUTHOR_NAME ?? ''),
      __AUTHOR_EMAIL__: JSON.stringify(rootEnv.AUTHOR_EMAIL ?? rootEnv.PUBLIC_AUTHOR_EMAIL ?? ''),
      __AUTHOR_GITHUB__: JSON.stringify(rootEnv.AUTHOR_GITHUB ?? rootEnv.PUBLIC_AUTHOR_GITHUB ?? ''),
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'framer-motion'],
    },
    ssr: {
      noExternal: ['framer-motion'],
    },
    resolve: {
      alias: {
        '@myblog/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
      },
      dedupe: ['react', 'react-dom'],
    },
  },
});
