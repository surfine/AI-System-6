<!-- canonical-source: docs/README.md -->
<!-- source-sha256: 6cf1b9091005af6d9c1bdb06677e5f249cf944004938ae584ca837167e3ad592 -->

> 英文版为准 ・ 仅供人类参考

# AI System 6 文档

这里是系统的公开地图。请选择最小且真正拥有你问题的文档开始阅读。

## 构建与架构

- [架构](ARCHITECTURE.zh-CN.md)——运行时边界、状态、模型提供商、资产、构建产物与
  公开源码契约。
- [开发指南](DEVELOPMENT.zh-CN.md)——本地设置、命令、测试、生成文件与贡献流程。
- [Desk Port：MCP](MCP.zh-CN.md)——Model Context Protocol 服务的设计提案：让其他
  agent 读取路线、提出建议，但永远不能提交。
- [参与贡献](../CONTRIBUTING.zh-CN.md)——issue 与 pull request 要求。
- [安全策略](../SECURITY.zh-CN.md)——支持版本与私密报告方式。

## 设计证据

- [设计契约](design/DESIGN.zh-CN.md)——产品身份、对象语法与跨时代规则。
- [人机界面指南](design/HIG.zh-CN.md)——可复用的应用与控件决策。
- [外观 QA](design/APPEARANCE-QA.zh-CN.md)——跨正式外观的取证与审查方法。
- [主题家族契约](design/THEME-FAMILY-CONTRACT.zh-CN.md)——共享资产与行为要求。
- [历史 UI 映射](design/historical-ui-mapping.zh-CN.md)——经典交互词汇的来源。

## 城市模拟器

- [城市模拟器](city-simulator/README.zh-CN.md)——原创 Bonsai City 模拟器基础：
  架构、确定性、存档格式、许可边界与 OpenSC2K 研究。

## 文档策略

英文文件是规范源；每一份都有 `.zh-CN.md` 参考镜像，头部固定其来源路径与内容哈希。
维护者源码中的 `npm run verify:docs` 会拦截缺失或过期镜像；公开 CI 则验证所有链接文件
与支持命令确实存在于发布树中。

内部发布编排、签名、主机配置、工作笔记与图标 accepted-source 档案不属于公开文档树。
已完成的计划和收尾报告不算长期文档：其中有效的决定必须进入所属契约、测试或 runbook，
随后删除临时文件。
