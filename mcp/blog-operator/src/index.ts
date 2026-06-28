#!/usr/bin/env node
/**
 * MyBlog Operator MCP Server (stdio transport)
 *
 * 启动：
 *   BLOG_API_BASE_URL=http://localhost:8787 \
 *   BLOG_AI_API_KEY=xxx \
 *   npx tsx src/index.ts
 *
 * Claude Desktop / Cursor / 其他 MCP host 配置：
 *   {
 *     "mcpServers": {
 *       "myblog-operator": {
 *         "command": "npx",
 *         "args": ["tsx", "C:/path/to/mcp/blog-operator/src/index.ts"],
 *         "env": {
 *           "BLOG_API_BASE_URL": "https://blog.your-domain.com",
 *           "BLOG_AI_API_KEY": "<your-key>"
 *         }
 *       }
 *     }
 *   }
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { BlogClient, BlogApiError } from './client.js';
import { toolDefinitions } from './tools/index.js';

async function main() {
  const cfg = loadConfig();
  const client = new BlogClient(cfg);

  const server = new Server(
    { name: 'myblog-operator', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // 列出工具
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  // 调用工具
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const def = toolDefinitions.find((t) => t.name === name);
    if (!def) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const parsed = def.inputSchema.parse(args ?? {});
      const result = await (def.handler as any)(client, parsed);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message =
        err instanceof BlogApiError
          ? `[${err.status}] ${JSON.stringify(err.body)}`
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 启动消息写到 stderr，避免污染 stdout JSON-RPC 帧
  console.error(`[myblog-operator] connected to ${cfg.baseUrl}`);
}

// 极简的 zod → JSON Schema 转换（避免再加 zod-to-json-schema 依赖）
// 仅支持 MCP 工具用到的常见类型：string / number / boolean / enum / array / object
function zodToJsonSchema(schema: any): any {
  const def = schema._def;
  if (!def) return { type: 'object' };

  if (def.typeName === 'ZodObject') {
    const properties: any = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(def.shape())) {
      const child = zodToJsonSchema(value);
      properties[key] = child;
      if (!(value._def?.typeName === 'ZodOptional' || value.isOptional?.())) {
        required.push(key);
      }
    }
    return { type: 'object', properties, ...(required.length ? { required } : {}) };
  }
  if (def.typeName === 'ZodOptional') {
    return zodToJsonSchema(def.innerType);
  }
  if (def.typeName === 'ZodString') {
    return { type: 'string', ...(def.checks?.length ? { description: def.description } : {}) };
  }
  if (def.typeName === 'ZodNumber') {
    return { type: 'number' };
  }
  if (def.typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }
  if (def.typeName === 'ZodEnum') {
    return { type: 'string', enum: def.values };
  }
  if (def.typeName === 'ZodArray') {
    return { type: 'array', items: zodToJsonSchema(def.type) };
  }
  if (def.typeName === 'ZodLiteral') {
    return { type: typeof def.value, enum: [def.value] };
  }
  return { type: 'object' };
}

main().catch((err) => {
  console.error('[myblog-operator] fatal:', err.message);
  process.exit(1);
});
