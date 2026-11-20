/** TavilyWorld: 联网搜索的 World。它把 Tavily 的 REST 接口暴露成 `tavily_search` 工具，结果以标题、链接和摘要返回。 */
import type { EventEnvelope, ToolCallContext, ToolDef, ToolOutcome, World, WorldHost, WorldWebUiDecl } from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { fileURLToPath } from 'node:url';
import { TAVILY_ID, TavilyConfigSection, TavilyCONFIG_GROUP, TavilyDEFAULTS } from './config.ts';

/** 告诉 bot 什么时候该调 tavily_search、结果怎么引用、不要滥用。 */
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

/** Tavily 搜索工具的声明（不带 handler，handler 在 tools() 里绑定到实例）。 */
export const TOOL_DECLS: Omit<ToolDef, 'handler'>[] = [
  {
    name: 'tavily_search',
    description: 'Search the live web with Tavily and return results with titles, URLs and snippets.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'The search query.' },
        max_results: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Maximum number of results to return.' },
      },
      required: ['query'],
    },
    tags: ['read'],
  },
];

/** 搜索一次 Tavily,把结果归一化成 { results: [{ title, url, snippet }], provider: 'tavily' }。 */
async function searchTavily(endpoint: string, getApiKey: () => string | undefined, query: string, maxResults: number, signal?: AbortSignal, botDir?: string): Promise<{ results: Array<{ title: string; url: string; snippet: string }>; provider: string }> {
  const key = getApiKey();
  if (!key) {
    const file = botDir ? `${botDir.replace(/[\\/]+$/, '')}/.env` : '部署目录的 .env 文件';
    throw new Error(`缺少 Tavily 密钥。请把 TAVILY_API_KEY=你的密钥 这一行加入 ${file}（一行一个，值不能含空格）。保存后下一次调用即生效，无需重启。`);
  }
  if (!query || typeof query !== 'string') throw new Error('query 是必填的搜索词。');
  const n = Number.isFinite(maxResults) ? Math.min(10, Math.max(1, Math.floor(maxResults))) : TavilyDEFAULTS.maxResults;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, api_key: key, max_results: n }),
    signal,
  });
  if (!res.ok) throw new Error(`tavily search failed: HTTP ${res.status}`);
  const data = await res.json() as { results?: unknown[]; items?: unknown[] };
  const rows = (data.results ?? data.items ?? []) as Array<Record<string, unknown>>;
  return {
    results: rows.map((row) => ({
      title: String(row.title ?? row.url ?? ''),
      url: String(row.url ?? row.title ?? ''),
      snippet: String(row.snippet ?? row.content ?? row.summary ?? ''),
    })),
    provider: 'tavily',
  };
}

export class TavilyWorld implements World {
  readonly id = TAVILY_ID;
  private host: WorldHost | null = null;

  constructor(private readonly opts: { cfg: TavilyConfigSection; timezone: string; getApiKey: () => string | undefined; botDir?: string }) { }

  envPromptVars(): Record<string, string> {
    const envFile = this.opts.botDir ? `${this.opts.botDir.replace(/[\\/]+$/, '')}/.env` : '(未取到部署目录)';
    return { 'tavily.endpoint': this.opts.cfg.endpoint ?? '(default)', 'tavily.envFile': envFile };
  }

  tools(): ToolDef[] {
    return [{ ...TOOL_DECLS[0], handler: this.searchHandler.bind(this) }];
  }

  webUi(): WorldWebUiDecl {
    return {
      config: [TavilyCONFIG_GROUP],
      promptDocs: [{
        key: `worlds.${TAVILY_ID}.envPrompt`,
        title: 'Tavily 环境提示',
        description: '告诉 bot 什么时候用 tavily_search,结果怎么引用,不要滥用。',
        path: ENV_PROMPT_FILE,
        role: 'envPrompt',
        vars: [
          { name: 'tavily.endpoint', description: 'Tavily 搜索接口地址,留空使用内置默认值。' },
          { name: 'tavily.envFile', description: '密钥文件 .env 的准确路径，用于回答用户「密钥填哪里」。' },
        ],
      }],
    };
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    await host.pushEvent({ type: 'tavily.started', source: this.id, origin: 'internal', senderKey: this.id, ts: nowIso(this.opts.timezone), text: 'tavily 已就绪。' });
  }

  async stop(): Promise<void> {
    this.host = null;
  }

  private async searchHandler(args: Record<string, unknown>, ctx: ToolCallContext): Promise<ToolOutcome> {
    const query = typeof args.query === 'string' ? args.query : '';
    const maxResults = typeof args.max_results === 'number' ? args.max_results : TavilyDEFAULTS.maxResults;
    const out = await searchTavily(this.opts.cfg.endpoint ?? 'https://api.tavily.com/search', this.opts.getApiKey, query, maxResults, ctx?.signal, this.opts.botDir);
    return { text: JSON.stringify(out, null, 2) };
  }
}
