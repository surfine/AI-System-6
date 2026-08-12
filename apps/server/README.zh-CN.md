<!-- canonical-source: apps/server/README.md -->
<!-- source-sha256: 689634301422a6cf5d7e99136433d05c2e729eac5a3b204ba48b2bba0fbad262 -->

# apps/server/ —— AI System 6 服务端源码

英文版为准。本文档仅供人类参考，不被任何脚本读取。

本目录现在是主应用的服务端权威源码。仓库根目录的 `npm start` 会先重建
浏览器 bundle，然后运行 `node apps/server/server.js`。

旧文档可能还会把 `apps/server/` 描述成运行在另一个端口的镜像重写。那个阶段已经
结束。除非 `CLAUDE.md` 另有说明，否则请把 `apps/server/server.js`、
`apps/server/server/router.js`、`apps/server/server/routes/` 和 `apps/server/server/importers/`
视为当前有效的服务端实现。

## 运行

```sh
npm start
# 默认: http://localhost:4173
```

通过 `PORT=4280 npm start` 覆盖端口。服务端单独调试时也可以运行
`node apps/server/server.js`，但它不会重建 `apps/desktop/app.bundle.js`。

`apps/server/server/router.js` 负责路由表和静态文件兜底。未知路由会返回结构化
404。

## 目录结构

```
apps/server/
  server.js                入口。构建路由表并启动 http。
  server/
    router.js              dispatch 表。
    lib/
      http.js              send、readJsonBody、requestSignal、
                           withTimeoutSignal。
      text.js              decodeHtml、stripTags、cleanText。
      build-info.js        版本号与 build 戳解析。
      fetch.js, proxy.js,
      local-urls.js,
      lmstudio-models.js,
      lms-cli.js,
      numbers.js, url.js   共享服务端 helper。
    routes/
      *.js                 聚焦的 HTTP API route handler。
    importers/
      *.js                 /api/import-text 文件格式处理器。
  tsconfig.json            allowJs + checkJs + noEmit。类型检查通过
                           `npm --prefix apps/server run typecheck` 运行。
```

## 服务端契约

- 保留 `CLAUDE.md` 记录的 UI、API 和浏览器持久化契约。
- 不引入新的运行时框架、转译器、打包器。
- 可行时保持每个 HTTP endpoint 一个 route 文件。
- 共享服务端逻辑放在 `apps/server/server/lib/` 或聚焦的功能模块
  （`chat.js`、`cloud.js`、`reader.js` 等），不要塞进 route 文件。
- 在公共函数签名上加 JSDoc，让 `tsc --noEmit` 能抓住契约漂移。

## 非目标

- 行为改动。若发现行为差异，那是 bug。
- 重新排版或删除 `CLAUDE.md` 中记录的 System 6 产品细节。
- 把客户端代码迁移进 `apps/server/`。浏览器代码位于 `apps/desktop/app.js`，以及
  `apps/desktop/app/core/`、`apps/desktop/app/features/`、`apps/desktop/app/data/`、`apps/desktop/app/content/` 和
  `apps/desktop/app/vendor/`。
