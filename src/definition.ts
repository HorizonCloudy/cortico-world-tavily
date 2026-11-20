/** The `tavily` World definition: web search through Tavily. */
import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { TavilyCONFIG_GROUP, TavilyDEFAULTS, type TavilyConfigSection } from './config.ts';
import { TavilyWorld, TOOL_DECLS } from './world.ts';

/** The definition, without any assembly: the host supplies the secret at create time. */
export function tavilyDefinition(): WorldDefinition<TavilyConfigSection> {
  return {
    id: 'tavily',
    label: 'tavily',
    defaults: () => structuredClone(TavilyDEFAULTS),
    create: (ctx) => new TavilyWorld({
      cfg: ctx.cfg,
      timezone: ctx.timezone,
      getApiKey: () => ctx.secret('TAVILY_API_KEY'),
      botDir: ctx.botDir,
    }),
    describe: {
      tools: describeTools(TOOL_DECLS, {
        tavily_search: {
          zh: '用 Tavily 搜索联网,带标题、链接和摘要返回结果。',
          en: 'Searches the live web with Tavily, returning results with titles, URLs and snippets.',
        },
      }),
      events: [
        {
          type: 'tavily.started',
          description: { zh: '世界已挂载。', en: 'The world was mounted.' },
        },
      ],
    },
  };
}

export const Tavily = tavilyDefinition();
