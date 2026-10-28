// A small aaronlau.me chunk index in the shape ai6/rag.json uses, for the
// 潮汐信笺 × SideAsk tests.
export function fixturePack() {
  const docs = [
    { id: "vista-2013", k: "post", t: "个人计算的新纪元", d: "2013-01-29", u: "https://aaronlau.me/2013/01/29/", g: ["Windows", "App-scope"], s: "App-scope", a: 1 },
    { id: "iphone-240g", k: "post", t: "240 克，摸过以后", d: "2021-09-25", u: "https://aaronlau.me/2021/09/25/", g: ["iPhone"], s: null, a: 0 },
    { id: "iphone-air-165", k: "post", t: "165 克本该是正常手机的重量", d: "2025-09-30", u: "https://aaronlau.me/2025/09/30/", g: ["iPhone"], s: null, a: 0 },
    { id: "long-glass", k: "long", t: "玻璃与他们的产地", d: "2025-10-01", u: "https://aaronlau.me/long/where-the-glass-came-from/", g: ["Liquid Glass"], s: null, a: 0 },
    { id: "modem-bet", k: "post", t: "iPhone 18 Pro 未必用 C2", d: "2025-12-31", u: "https://aaronlau.me/2025/12/31/", g: ["预言账本"], s: "预言账本", a: 0 },
    { id: "vista-2026", k: "post", t: "Liquid Glass 画成了 Vista", d: "2026-08-12", u: "https://aaronlau.me/2026/08/12/", g: ["设计与界面"], s: null, a: 0 },
  ];
  const chunks = [
    { d: 0, p: 0, x: "六年前的今天，微软面向大众市场发布 Windows Vista，这是一款耗费上百亿美元的操作系统。" },
    { d: 0, p: 1, x: "尽管 Windows Vista 生不逢时，但它对微软今后各种产品作出了不可磨灭的贡献。" },
    { d: 1, p: 0, x: "发布当晚我写过一条回旋镖：厨子用重达 240 克的手机，iPhone 的重量越来越难接受。" },
    { d: 2, p: 0, x: "iPhone Air 只有 165 克，这个重量本该是正常手机的重量，是这些年我们把重量当成了代价。" },
    { d: 2, p: 2, h: "拿在手里", x: "薄和轻改变的是拿在手里的感觉，而不是参数表。" },
    { d: 3, p: 1, x: "Liquid Glass 的玻璃材质来自系统控件，评论区说它是 Vista 2.0。" },
    { d: 4, p: -1, k: "pred", x: "预言 251231：iPhone 18 Pro 未必搭载 C2 基带；立账 2025-12-31；状态：待定", pr: { id: "251231", made: "2025-12-31", status: "pending", label: "待定", due: null, resolved: null, confidence: null } },
    { d: 5, p: 0, x: "我决定给 AI System 6 多画一套外观，结果 Liquid Glass 画出来像 Vista 的 Aero。" },
  ];
  return { schema: 1, kind: "aaronlau-rag", chunking: "top-block-v1", generatedAt: "2026-10-24T00:00:00.000Z", docs, chunks };
}
