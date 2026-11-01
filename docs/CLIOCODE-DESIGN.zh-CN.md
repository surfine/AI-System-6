<!-- canonical-source: docs/CLIOCODE-DESIGN.md -->
<!-- source-sha256: a995ebb4db77d00df31f372b34d161a3662c140cb1ce980f54ef9bb0fabe6761 -->

> 英文版为准 ・ 仅供人类参考

# ClioCode 设计（M9 地基）

本文件是占位镜像：按作者拍板（2026-10-30），ClioCode 设计稿这一轮只写英文，中文全文
翻译暂不需要。英文版 `docs/CLIOCODE-DESIGN.md` 为准，下面只给各节的中文索引，方便人
类对照阅读。

ClioCode 是 2.0 里新增、只在 Mac 上的 app，像 Claude Code 一样：命令在写作者的 Mac 上
跑，在原地按权限模式改代码，用 macOS Seatbelt 沙盒（写入限项目文件夹和暂存，网络走代
理白名单）和网络白名单把自己围住。引擎仍是 Clio 代理用的同一套 DeepSeek Harness
（`dsh`，`apps/server/server/agent/engine-host.js`），复用 `sandbox-profile.js` 与
`egress-proxy.js` 的做法。

## 各节索引（详见英文版）

- **ClioCode 与 Clio 代理的区别**：Clio 代理在影子副本上工作、按文件「放回」；ClioCode
  在真实文件夹里原地改、用检查点与回退（和 Claude Code 一致）。原因：代码文件夹是活的
  依赖图（`node_modules`、`.git`、构建产物），影子复制不现实；开发者本来就有 git 做安
  全网；写入边界由 Seatbelt 承担，审阅面由权限模式承担，撤销由检查点承担。
- **四种权限模式**：Manual（先问我，默认）／Accept edits（改文件不问）／Plan（只看计
  划，只读）／Auto（除删除和沙盒外执行外自动跑）；Bypass 只在隔离环境可用，真实 Mac 上
  被拒。表格给出每种工具调用在每个模式下是自动跑／询问／拒绝。网络主机准入和越界路径由
  另一层（网络过滤器、Seatbelt）决定，与模式无关。
- **代码文件夹的 Seatbelt 配置**：可写＝项目文件夹＋每次运行的暂存；读取对代码文件夹放
  宽（但对 `~/.ssh`、Keychain 等密钥库设黑名单）；git、node_modules、包管理器缓存、构建
  工具如何放进去；可执行白名单在生成配置时按开发者真实工具链解析（node、npm、npx、git
  和 shell 在子进程 PATH 上的实际路径、realpath 及其所属安装：npm 包、前缀的 bin/
  libexec、Homebrew 前缀、volta/asdf/mise 垫片目录），项目文件夹和暂存里的东西一律不能
  执行；「沙盒外执行」是另起一个不套沙盒的子进程、每次单独核准，不是升级同一进程的沙盒。
- **网络白名单**：Seatbelt 拒绝全部出站网络（公网、本机所有地址、unix 套接字、DNS 解析
  器），只开一个回环端口，端口上跑 CONNECT-only 过滤代理（`egress-proxy.js`），再加一张
  主机白名单（包管理注册源、git 主机，只开 443 的 HTTPS）。
- **原地改的检查点与回退**：每次写/删工具调用前对将触及的文件做快照，回退原子写回并裁掉
  其后的账本；不是 git 的替代，持久记录仍是作者自己的提交。
- **许可如何到达界面**：复用每次启动的口令（D7）和代理路由；`ask` 时宿主发
  `permission_request` 事件，界面显示 System 6 卡片，写作者的选择回到
  `POST /api/cliocode/runs/:id/permission`。
- **窗口样子**：见
  `internal/design-proposals/2026-10-30-ai-system-agentic-2.0/ClioCode.dc.html`。
- **风险与安全验收**：每个模式各跑一轮攻击（U8），加一轮沙盒攻击，干净才合入。
- **M9 切片计划**：M9.1 权限核心、M9.2 代码 Seatbelt、M9.3 原地跑＋检查点、M9.4 网络白名
  单、M9.5 沙盒外核准、M9.6 窗口、M9.7 任意文件夹、M9.8 安全轮＋发布，每片各有验收。
- **本轮技术证明**：`tooling/spikes/cliocode/` 下的 Node 脚本（权限决策纯函数＋单测、
  Seatbelt 配置生成器、样例项目、沙盒证明）。
