/**
 * 烟雾测试 —— 模拟 MCP host 通过 stdio 调用 3 个工具。
 * 启动方式：node smoke.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const child = spawn(
  process.execPath,
  ['C:/Users/24062/Desktop/myblog/node_modules/tsx/dist/cli.mjs', 'src/index.ts'],
  {
    cwd: 'C:/Users/24062/Desktop/myblog/mcp/blog-operator',
    env: {
      ...process.env,
      BLOG_API_BASE_URL: 'http://localhost:8787',
      BLOG_AI_API_KEY: 'dev-ai-key-change-me-in-production-12345',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }
);

child.stderr.on('data', (d) => process.stderr.write(`[mcp-stderr] ${d}`));

let buf = '';
let id = 0;
const pending = new Map();

function send(method, params) {
  const req = { jsonrpc: '2.0', id: ++id, method, params };
  child.stdin.write(JSON.stringify(req) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(req.id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(req.id)) {
        pending.delete(req.id);
        reject(new Error(`timeout for ${method}`));
      }
    }, 10000);
  });
}

child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    } catch (e) {
      console.error('[parse fail]', e, line);
    }
  }
});

(async () => {
  try {
    // 1) 初始化
    const init = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '0' },
    });
    console.log('✅ initialize:', init.serverInfo?.name);

    // 2) 列表工具
    const tools = await send('tools/list', {});
    console.log(`✅ tools/list: ${tools.tools.length} tools`);
    console.log('   names:', tools.tools.map((t) => t.name).join(', '));

    // 3) 调 get_analytics_summary
    const analytics = await send('tools/call', {
      name: 'get_analytics_summary',
      arguments: {},
    });
    const text = analytics.content?.[0]?.text;
    if (analytics.isError) throw new Error('analytics failed: ' + text);
    const data = JSON.parse(text);
    console.log(`✅ get_analytics_summary: today_pv=${data.today_pv}, total_posts=${data.total_posts}`);

    // 4) 调 list_drafts
    const drafts = await send('tools/call', {
      name: 'list_drafts',
      arguments: { status: 'draft', limit: 5 },
    });
    const draftsText = drafts.content?.[0]?.text;
    if (drafts.isError) throw new Error('drafts failed: ' + draftsText);
    const draftsData = JSON.parse(draftsText);
    console.log(`✅ list_drafts: ${draftsData.count} drafts`);

    // 5) 调 list_recent_posts
    const posts = await send('tools/call', {
      name: 'list_recent_posts',
      arguments: { limit: 3 },
    });
    const postsText = posts.content?.[0]?.text;
    if (posts.isError) throw new Error('posts failed: ' + postsText);
    const postsData = JSON.parse(postsText);
    console.log(`✅ list_recent_posts: ${postsData.count} posts, first="${postsData.posts[0]?.title}"`);

    // 6) 调一个会出错的（错 status）—— 验证错误返回
    const errTest = await send('tools/call', {
      name: 'get_draft',
      arguments: { id: 99999 },
    });
    console.log(`✅ get_draft(99999) error path: isError=${errTest.isError}, msg="${errTest.content?.[0]?.text?.slice(0, 80)}"`);

    console.log('\n🎉 all smoke tests passed');
    process.exit(0);
  } catch (e) {
    console.error('❌ FAIL:', e.message);
    process.exit(1);
  } finally {
    child.kill();
  }
})();
