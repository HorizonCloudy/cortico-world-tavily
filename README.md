# cortico-world-tavily

Cortico World 插件：通过 Tavily 做联网搜索。世界 id `tavily`，暴露搜索工具 `tavily_search`，把结果以标题、链接和摘要返回，供 bot 引用。

## API key 怎么配置

密钥名是 `TAVILY_API_KEY`，由宿主的 secret 注入，不写进配置文件明文。在宿主里把密钥填到对应的 secret 项后，本 World 在 `create` 时通过 `ctx.secret('TAVILY_API_KEY')` 读取。缺失密钥时，`tavily_search` 会抛出错误并提示配置密钥。

## 如何安装 cortico SDK

本插件不自带 cortico SDK（`vendor/cortico` 为空 submodule），按模板规范编写，并在 `tsconfig.json` 中把 `cortico/*` 映射到 `../../vendor/cortico/src`，待宿主或 submodule 提供 SDK 后可直接编译运行。

1. 初始化 submodule：
   ```sh
   git submodule update --init vendor/cortico
   ```
   或按宿主给出的 SDK 安装指南操作。
2. 安装依赖：
   ```sh
   pnpm install
   ```

## 如何运行

```sh
pnpm test      # vitest run
pnpm typecheck # tsc --noEmit
```

## Known limitation

Tavily 的 REST 端点按文档推断（`https://api.tavily.com/search`，body 带 `api_key` 与 `{ query, api_key, max_results }`）。若 anysearch / tavily / exa 官方 REST 规范有变更，以官方为准。
