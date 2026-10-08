<!-- canonical-source: vendor/ubol/PROVENANCE.md -->
<!-- source-sha256: 86d0407a833bcf1190a66cbb67aa93d4a6526b5329ccb76d2d666c56d264d7bd -->

# Time Machine 中的 uBlock Origin Lite

> 英文版为准，本文仅供人类参考。

Time Machine 用 uBlock Origin Lite（uBOL，作者 Raymond Hill 及贡献者，GPL-3.0 许可；这里的 `LICENSE` 是扩展自带的副本）拦截广告和跟踪器，未做任何修改。

- 来源：https://github.com/uBlockOrigin/uBOL-home，版本锁定在 `PIN.json`，并记录每个发布包的 SHA-256。`npm run browse:fetch-filters` 下载、校验后解包到 `.cache/ubol/<版本>/`（git 忽略）。
- Mac 应用原样打包 Safari 版（`Contents/Resources/ubol-safari`），作为 Web 扩展加载到原生 Time Machine 页面。
- 网页引擎把 Chromium 版的规则集当作数据使用：`npm run browse:build-filters` 把 ublock-filters、easylist、easyprivacy、pgl、ublock-badware、urlhaus-full 和 chn-0 的网络规则与站点专属隐藏规则编译到 `apps/browse/filters/`（git 忽略）。这些文件派生自 GPL-3.0 的列表，只发给 Time Machine 的浏览源。
- 匹配器（`apps/browse/filter-match.js`）和编译器（`tooling/browse/build-filters.mjs`）是本项目自己的代码。
