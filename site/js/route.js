// The writing route: the product's spine, shown stop by stop.
//
// Four of the eight stops are photographs of the running app, captured by
// tooling/capture-site-route.mjs with one real piece of writing in them. The
// other four are objects the route hands work to, described in plain words.
// Nothing here is a mockup, and nothing here is model output.

import { L } from "./copy.js?v=20260820a";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const STOPS = [
  {
    label: L("Project Hard Disk", "项目硬盘"),
    lede: L("Where the work lives.", "作品长期留下的地方。"),
    note: L("The durable half of the desk. Projects, references, drafts, and chosen clips stay here after the tab closes.", "这是桌面持久的一半。标签页关闭后，项目、参考资料、草稿和主动留下的摘录仍在这里。"),
  },
  {
    label: L("File Floppy", "文件软盘"),
    lede: L("What you brought in.", "这一次带进来的材料。"),
    note: L("PDFs, pages, audio, and images are mounted as temporary source context. Useful material becomes durable only after you clip or write it to the project.", "PDF、网页、录音和图片会作为临时来源上下文挂载。有用材料只有在摘录或写入项目后才会长期留下。"),
  },
  {
    label: L("Question Sheet", "问题单"),
    lede: L("Your questions, before any prose.", "在正文之前，先保住自己的问题。"),
    note: L("Name the real recipient, the raw questions, what you saw yourself, the objection you expect, and the friction in the handoff. The more specific the human material, the less room the model has to fill with a generic voice.", "写下真实接收者、原始问题、亲眼观察、预料中的反对意见和交付摩擦。人的材料越具体，模型越没有机会用通用语气补空。"),
    shot: "question-sheet",
    alt: L("The Question Sheet window in AI System 6, filled with a writer's own raw notes: the recipient, unanswered questions about the 240 GWh figure, an observation made on the barrage road, and the objection the writer expects.", "AI System 6 的问题单窗口，保留写作者的粗糙笔记：接收者、尚无答案的 240 GWh 数字、在拦河坝公路上的亲眼观察，以及预料中的反对意见。"),
  },
  {
    label: L("Outline", "大纲"),
    lede: L("Structure, still in your words.", "结构仍然用你的话写。"),
    note: L("Each ## heading becomes a Section Draft target. Move the shape of the argument here, before a page of prose makes every change expensive.", "每个 ## 标题都会成为一份章节草稿的目标。趁正文尚未变重，先在这里移动论证结构。"),
    shot: "outline",
    alt: L("The Outline window showing four Markdown sections for the article, each with a line of the writer's intent under it.", "大纲窗口显示文章的四个 Markdown 章节，每节下面仍是写作者自己的意图。"),
  },
  {
    label: L("Section Drafts", "章节草稿"),
    lede: L("One section at a time.", "一次只处理一节。"),
    note: L("This captured draft keeps an unverified figure visibly unverified. The route does not invent a resolution merely to make the paragraph look finished.", "截图里的草稿让一个尚未核实的数字继续保持待核。路线不会为了让段落看起来完整，就替作者编出答案。"),
    shot: "section-drafts",
    alt: L("The Section Drafts window: 80 words, editing section 1 of 4, with a paragraph that openly states the writer still cannot split the 240 GWh figure.", "章节草稿窗口正在编辑四节中的第一节，并明确保留写作者仍无法拆分 240 GWh 数字这一未知。"),
  },
  {
    label: L("Manuscript", "正文"),
    lede: L("The document itself.", "正文文件本身。"),
    note: L("TeachText holds the manuscript. During section drafting it is read-only and says so: one phase owns the editable text, so a stray command cannot rewrite an older copy behind your back.", "TeachText 承载正文。章节起草期间，它会明确显示为只读：每个阶段只有一处拥有编辑权，零散命令不会在背后改写旧副本。"),
    shot: "teachtext",
    alt: L("The TeachText manuscript window, 82 words across 7 paragraphs, with a status bar reading Read-only, edit in Section Drafts.", "TeachText 正文窗口共有七段，状态栏显示只读，并提示应在章节草稿中编辑。"),
  },
  {
    label: L("Review Desk", "审校台"),
    lede: L("The draft read back to you.", "让定稿重新对你说一遍。"),
    note: L("Review Desk makes factual, structural, and model-voice risk visible: unsupported claims, over-regular rhythm, generic summaries, and personal detail flattened away.", "审校台把事实、结构和模型口吻风险摆到明处：缺少支持的论断、过分规整的节奏、通用总结腔，以及被抹平的个人细节。"),
  },
  {
    label: L("Project CD", "项目光盘"),
    lede: L("Handed off.", "把作品交出去。"),
    note: L("The finished Markdown and other read-only exports become explicit handoff objects. Nothing reaches the disc merely because it appeared on screen.", "完成的 Markdown 和其他只读导出会成为明确的交付对象。任何内容都不会只因在屏幕上出现过，就自动进入光盘。"),
  },
];

export function initRouteScene(stage) {
  if (!stage) return;
  stage.innerHTML = `
    <ol class="route-belt" role="tablist" aria-label="${L("The writing route, stop by stop", "逐站查看写作路线")}"></ol>
    <div class="route-panel" id="route-panel"></div>`;
  const belt = stage.querySelector(".route-belt");
  const panel = stage.querySelector("#route-panel");
  let walker = null;

  const buttons = STOPS.map((stop, index) => {
    const item = doc.createElement("li");
    item.className = "route-step";
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "route-obj";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.id = `route-tab-${index}`;
    const ordinal = doc.createElement("span");
    ordinal.className = "route-ordinal";
    ordinal.textContent = String(index + 1);
    button.appendChild(ordinal);
    const label = doc.createElement("span");
    label.className = "route-obj-label";
    label.textContent = stop.label;
    button.appendChild(label);
    if (stop.shot) {
      const mark = doc.createElement("span");
      mark.className = "route-has-shot";
      mark.title = L("Photographed in the running app", "来自运行中应用的截图");
      mark.setAttribute("aria-label", L("photographed in the running app", "来自运行中应用的截图"));
      mark.textContent = "◉";
      button.appendChild(mark);
    }
    button.addEventListener("click", () => {
      stopWalk();
      select(index);
    });
    item.appendChild(button);
    belt.appendChild(item);
    return button;
  });

  function select(index) {
    buttons.forEach((button, other) => {
      button.classList.toggle("is-active", other === index);
      button.setAttribute("aria-selected", String(other === index));
    });
    const stop = STOPS[index];
    panel.innerHTML = "";
    panel.setAttribute("aria-labelledby", `route-tab-${index}`);

    const text = doc.createElement("div");
    text.className = "route-text";
    const heading = doc.createElement("h3");
    heading.className = "route-stop-head";
    heading.textContent = `${index + 1}. ${stop.label}`;
    const lede = doc.createElement("p");
    lede.className = "route-stop-lede";
    lede.textContent = stop.lede;
    const note = doc.createElement("p");
    note.className = "route-stop-note";
    note.textContent = stop.note;
    text.append(heading, lede, note);

    if (stop.shot) {
      const figure = doc.createElement("figure");
      figure.className = "route-shot";
      const image = doc.createElement("img");
      image.src = `img/route/${stop.shot}.webp?v=20260815a`;
      image.alt = stop.alt;
      image.loading = "lazy";
      image.decoding = "async";
      figure.appendChild(image);
      const caption = doc.createElement("figcaption");
      caption.textContent = L("Photographed in the running app. No model connected.", "拍摄自运行中的应用；没有连接模型。" );
      figure.appendChild(caption);
      panel.append(figure, text);
    } else {
      panel.append(text);
    }
  }

  function stopWalk() {
    if (!walker) return;
    clearInterval(walker);
    walker = null;
  }

  select(0);

  // The route walks itself once, when the visitor arrives at it.
  if ("IntersectionObserver" in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        let index = 0;
        walker = setInterval(() => {
          index += 1;
          if (index >= STOPS.length) {
            stopWalk();
            return;
          }
          select(index);
        }, 2200);
      });
    }, { threshold: 0.35 });
    observer.observe(stage);
  }
}
