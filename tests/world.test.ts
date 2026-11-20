import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import type { ToolDef, WorldHost } from 'cortico/core/types.ts';
import { Tavily } from '../src/definition.ts';
import { TavilyWorld } from '../src/world.ts';
import { TavilyDEFAULTS, type TavilyConfigSection } from '../src/config.ts';

const packageDir = fileURLToPath(new URL('.', import.meta.url));

function scratchDir() {
  return mkdtempSync(join(tmpdir(), 'tavily-'));
}

/** 只记录 pushEvent 的最小宿主，够用于断言 start 推事件。 */
function recordingHost() {
  const events: unknown[] = [];
  const host: WorldHost = {
    pushEvent: (e: unknown) => { events.push(e); return Promise.resolve(e as never); },
    store: { get: () => undefined, latestCursor: () => 0, range: () => [], around: () => [], grep: () => [] },
    pushDeferred: () => {},
    drainPendingEvents: async () => [],
    modelFacts: { model: () => 'test', accepts: () => false, contextWindow: () => 128000 },
    log: { child: () => ({}), info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {}, emit: () => {} },
  } as unknown as WorldHost;
  return { host, events };
}

const DEFAULT_CFG: TavilyConfigSection = { ...TavilyDEFAULTS, enabled: true };
const CTX: Parameters<ToolDef['handler']>[1] = { role: 'test', log: {} as never };

describe('definition', () => {
  it('passes the extension dry mount without failures', async () => {
    const report = await dryMountWorld(Tavily as never, { scratchDir: scratchDir(), packageDir });
    expect(report.failures).toEqual([]);
  });
});

describe('lifecycle', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('start 推送 tavily.started，origin 为 internal', async () => {
    const { host, events } = recordingHost();
    const world = new TavilyWorld({ cfg: DEFAULT_CFG, timezone: 'UTC', getApiKey: () => 'test-key' });
    await world.start(host);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'tavily.started', origin: 'internal', senderKey: 'tavily', text: 'tavily 已就绪。' });
  });
});

describe('search tool', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('存在并可被调用：mock 密钥与 fetch，断言返回结构', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(_input), body: init?.body });
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ title: 'Tavily', url: 'https://tavily.com', snippet: 'a search API' }] }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const world = new TavilyWorld({
      cfg: { ...DEFAULT_CFG, endpoint: 'https://api.tavily.com/search' },
      timezone: 'UTC',
      getApiKey: () => 'test-key',
    });
    const tool = world.tools()[0];
    expect(tool.name).toBe('tavily_search');
    const out = (await tool.handler!({ query: 'coopanion', max_results: 3 } as Record<string, unknown>, CTX)) as { text: string };
    const data = JSON.parse(out.text);
    expect(data.provider).toBe('tavily');
    expect(data.results).toEqual([{ title: 'Tavily', url: 'https://tavily.com', snippet: 'a search API' }]);
    expect(captured).toHaveLength(1);
    expect(JSON.parse(captured[0].body as string)).toMatchObject({ query: 'coopanion', max_results: 3, api_key: 'test-key' });
  });

  it('缺少密钥时抛出并提示配置密钥', async () => {
    const world = new TavilyWorld({
      cfg: DEFAULT_CFG,
      timezone: 'UTC',
      getApiKey: () => undefined,
    });
    const tool = world.tools()[0];
    await expect(tool.handler!({ query: 'x' } as Record<string, unknown>, CTX)).rejects.toThrow(/TAVILY_API_KEY/);
  });

  it('max_results 超界被夹到 1–10', async () => {
    const captured: unknown[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(_input), body: init?.body });
      return { ok: true, status: 200, json: async () => ({ results: [] }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const world = new TavilyWorld({
      cfg: DEFAULT_CFG,
      timezone: 'UTC',
      getApiKey: () => 'test-key',
    });
    const tool = world.tools()[0];
    await tool.handler!({ query: 'x', max_results: 100 } as Record<string, unknown>, CTX);
    expect(JSON.parse((captured[0] as { body: string }).body)).toMatchObject({ max_results: 10 });
    vi.restoreAllMocks();
  });
});

describe('config', () => {
  it('配置修改后 endpoint 立即生效（ctx.persist 模式）', async () => {
    const captured: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      captured.push(String(input));
      return { ok: true, status: 200, json: async () => ({ results: [] }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const wctx = fakeWorldContext(Tavily, { scratchDir: scratchDir(), packageDir });
    Object.assign(wctx.cfg, { ...DEFAULT_CFG });
    (wctx as { secret: (name: string) => string }).secret = () => 'test-key';
    const world = Tavily.create(wctx) as TavilyWorld;
    const tool = world.tools()[0];

    await tool.handler!({ query: 'first' } as Record<string, unknown>, CTX);
    expect(captured).toContain('https://api.tavily.com/search');

    wctx.persist({ endpoint: 'https://custom.example/search' });
    await tool.handler!({ query: 'second' } as Record<string, unknown>, CTX);
    expect(captured).toContain('https://custom.example/search');
    vi.restoreAllMocks();
  });
});
