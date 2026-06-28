/**
 * LLM 客户端（OpenAI 兼容）。
 *
 * 配置读取优先级：settings 表 > 环境变量。
 * - 后台「对话 AI 管理」页面 PUT 配置会写入 settings 表
 * - 写入后调用 _resetLlmClient() 让下一条 chat 立即用新配置
 *
 * 用法：
 * const llm = await getLlmClient();
 * if (!llm) {
 * // 未配置 LLM，走模板降级
 * } else {
 * const text = await llm.chat({ system, user });
 * }
 *
 * 环境变量（apps/api/.env，settings 表为空时的 fallback）：
 * LLM_BASE_URL=https://api.openai.com/v1   （或第三方 OpenAI 兼容 endpoint）
 * LLM_API_KEY=sk-xxx
 * LLM_MODEL=gpt-4o-mini
 * LLM_TIMEOUT_MS=30000                     （默认 30s）
 *
 * 兼容：OpenAI / Anthropic（via OpenAI-compatible proxy）/ DeepSeek / Ollama / LM Studio
 * 任何实现了 POST {base}/chat/completions 的端点都能用。
 *
 * 若全部配置缺失，getLlmClient() 返回 null，调用方应降级到模板生成。
 */

import { inArray } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** assistant 消息决定调用的工具 */
tool_calls?: LlmToolCall[];
  /** tool 消息：对应哪条 assistant tool_call.id */
tool_call_id?: string;
  /** tool 消息：哪个工具名（便于 LLM 关联） */
name?: string;
}

export interface LlmToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmTool {
  type: 'function';
  function: LlmToolFunction;
}

/** 单个工具调用（assistant 消息的 tool_calls[] 元素） */
export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LlmChatOptions {
  system?: string;
  user?: string;
  /** 直接传完整消息数组（高级用法：用于 tool_call 多轮） */
messages?: LlmMessage[];
  /** 工具定义（OpenAI 格式） */
tools?: LlmTool[];
  /** 'auto' | 'none' | { type: 'function', function: { name } } */
tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /** 温度（0-2）。默认 0.7 */
temperature?: number;
  /** 最大输出 token。默认 2048 */
max_tokens?: number;
  /** 流式响应回调（chat/stream 共用） */
onDelta?: (delta: string) => void;
}

export interface LlmClient {
  /** 一次性 chat completion，返回完整 assistant 消息（含 tool_calls） */
chat(opts: LlmChatOptions): Promise<LlmMessage>;
  /** 流式 chat completion，token 增量通过 onDelta 回调；返回完整 assistant 消息 */
stream(opts: LlmChatOptions, onDelta: (delta: string) => void): Promise<LlmMessage>;
}

/** 配置快照（settings 表 + env 合并后的最终值） */
export interface LlmConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

interface ResolvedConfig extends LlmConfig {
  /** 每个字段的来源：'settings' = 来自后台写入；'env' = 来自 .env */
source: {
    baseUrl: 'settings' | 'env';
    apiKey: 'settings' | 'env';
    model: 'settings' | 'env';
    timeoutMs: 'settings' | 'env';
  };
}

let _cached: LlmClient | null | undefined; // undefined = 未探测

/** 读取 settings 表相关 keys（不存在则回退 env）。 */
export async function readLlmConfig(): Promise<ResolvedConfig | null> {
  const db = getDb();
  const KEYS = ['llm.enabled', 'llm.base_url', 'llm.api_key', 'llm.model', 'llm.timeout_ms'];
  const rows = db
    .select()
    .from(schema.settings)
    .where(inArray(schema.settings.key, KEYS))
    .all();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  // settings 优先，env 兜底
  const fromSet = (k: string) => (map[k] ?? '').trim();
  const fromEnv = (k: string) => (process.env[k] ?? '').trim();

  const pick = (settingsKey: string, envKey: string): { value: string; src: 'settings' | 'env' } => {
    const s = fromSet(settingsKey);
    if (s) return { value: s, src: 'settings' };
    return { value: fromEnv(envKey), src: 'env' };
  };

  const baseUrlRaw = pick('llm.base_url', 'LLM_BASE_URL').value.replace(/\/+$/, '');
  const apiKey = pick('llm.api_key', 'LLM_API_KEY').value;
  const model = pick('llm.model', 'LLM_MODEL').value;
  const timeoutMsRaw = pick('llm.timeout_ms', 'LLM_TIMEOUT_MS').value;
  const enabledFlag =
    fromSet('llm.enabled') ||
    (baseUrlRaw && apiKey && model ? 'true' : ''); // 未显式开关但 env 三件齐全 → 默认开启

  const enabled = enabledFlag === 'true';
  if (!enabled || !baseUrlRaw || !apiKey || !model) return null;

  return {
    enabled: true,
    baseUrl: baseUrlRaw,
    apiKey,
    model,
    timeoutMs: Number(timeoutMsRaw || 30_000),
    source: {
      baseUrl: fromSet('llm.base_url') ? 'settings' : 'env',
      apiKey: fromSet('llm.api_key') ? 'settings' : 'env',
      model: fromSet('llm.model') ? 'settings' : 'env',
      timeoutMs: fromSet('llm.timeout_ms') ? 'settings' : 'env',
    },
  };
}

/** 探测 + 构造 LLM 客户端（async：因 settings 表查询是 IO）。 */
export async function getLlmClient(): Promise<LlmClient | null> {
  if (_cached !== undefined) return _cached;

  const cfg = await readLlmConfig();
  if (!cfg) {
    _cached = null;
    return null;
  }

  _cached = createClient({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
  });
  return _cached;
}

/** 测试用 + 配置保存后调用：清空缓存以便重新探测。 */
export function _resetLlmClient() {
  _cached = undefined;
}

function createClient(cfg: { baseUrl: string; apiKey: string; model: string; timeoutMs: number }): LlmClient {
  const url = `${cfg.baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };

  async function callApi(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    signal?.addEventListener('abort', () => ctrl.abort());
    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** 把 options 拼成 messages 数组：messages 优先；否则从 system+user 拼 */
function buildMessages(opts: LlmChatOptions): LlmMessage[] {
    if (opts.messages && opts.messages.length > 0) return opts.messages;
    const msgs: LlmMessage[] = [];
    if (opts.system) msgs.push({ role: 'system', content: opts.system });
    if (opts.user) msgs.push({ role: 'user', content: opts.user });
    return msgs;
  }

  /** 拼请求 body（tools 字段仅在提供时传入） */
function buildBody(opts: LlmChatOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: buildMessages(opts),
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 2048,
      stream,
    };
    if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;
    if (opts.tool_choice) body.tool_choice = opts.tool_choice;
    return body;
  }

  return {
    async chat(opts) {
      const res = await callApi(buildBody(opts, false));
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: LlmMessage }>;
      };
      const msg = json.choices?.[0]?.message;
      return msg ?? { role: 'assistant', content: '' };
    },

    async stream(opts, onDelta) {
      const res = await callApi(buildBody(opts, true));
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!res.body) throw new Error('LLM stream: empty body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // 累积完整 assistant 消息（含 tool_calls / content）
      let content = '';
      // tool_calls 是按 index 增量推送的，需要合并
      const toolCallsMap = new Map<number, { id?: string; name?: string; arguments?: string; type?: string }>();
      let finishReason: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            // 收尾：组装 tool_calls
            const tool_calls: LlmToolCall[] | undefined = toolCallsMap.size > 0
              ? Array.from(toolCallsMap.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([, v]) => ({
                    id: v.id ?? '',
                    type: 'function' as const,
                    function: { name: v.name ?? '', arguments: v.arguments ?? '' },
                  }))
              : undefined;
            return {
              role: 'assistant',
              content,
              ...(tool_calls ? { tool_calls } : {}),
            };
          }
          if (!payload) continue;
          try {
            const json = JSON.parse(payload);
            const choice = json.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta ?? {};
            // finish_reason 在最后一条带
            if (choice.finish_reason) finishReason = choice.finish_reason;
            // content 增量
            if (delta.content) {
              content += delta.content;
              onDelta(delta.content);
            }
            // tool_calls 增量（按 index 合并）
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                const cur = toolCallsMap.get(idx) ?? {};
                if (tc.id) cur.id = tc.id;
                if (tc.type) cur.type = tc.type;
                if (tc.function?.name) cur.name = (cur.name ?? '') + tc.function.name;
                if (tc.function?.arguments) cur.arguments = (cur.arguments ?? '') + tc.function.arguments;
                toolCallsMap.set(idx, cur);
              }
            }
          } catch {
            // 忽略单行解析错误，继续
          }
        }
      }
      // 走到这里说明流结束但没收到 [DONE]，同样组装一次
      const tool_calls: LlmToolCall[] | undefined = toolCallsMap.size > 0
        ? Array.from(toolCallsMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([, v]) => ({
              id: v.id ?? '',
              type: 'function' as const,
              function: { name: v.name ?? '', arguments: v.arguments ?? '' },
            }))
        : undefined;
      return {
        role: 'assistant',
        content,
        ...(tool_calls ? { tool_calls } : {}),
      };
    },
  };
}