/** Config section `worlds.tavily`, its defaults and the console config group. */
import type { ConfigGroup } from 'cortico/core/types.ts';
import type { WorldSection } from 'cortico/world.ts';

export const TAVILY_ID = 'tavily';

/** How the Tavily search endpoint is configured. */
export interface TavilyConfigSection extends WorldSection {
  /** The Tavily search endpoint; empty uses the built-in default. */
  endpoint?: string;
  /** How many results the tool returns at most, 1 to 10. */
  maxResults: number;
}

/** Built-in defaults: the world starts disabled, hits Tavily's search endpoint and returns five results. */
export const TavilyDEFAULTS: TavilyConfigSection = {
  enabled: false,
  endpoint: 'https://api.tavily.com/search',
  maxResults: 5,
};

const K = `worlds.${TAVILY_ID}`;

/** The console's config group for `worlds.tavily`, titled in the console's language. */
export const TavilyCONFIG_GROUP: ConfigGroup = {
  id: `world:${TAVILY_ID}`,
  owner: `world:${TAVILY_ID}`,
  schema: {
    type: 'object',
    title: 'Tavily 搜索',
    properties: {
      [`${K}.endpoint`]: {
        type: 'string',
        title: '端点',
        description: 'Tavily 搜索接口地址,留空使用内置默认值。',
      },
      [`${K}.maxResults`]: {
        type: 'integer',
        title: '最大结果数',
        minimum: 1,
        maximum: 10,
        description: '一次搜索最多返回的条目数。',
      },
    },
  },
};
