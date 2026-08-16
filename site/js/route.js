// The writing route: the product's spine, shown stop by stop.
//
// Four of the eight stops are photographs of the running app, captured by
// tooling/capture-site-route.mjs with one real piece of writing in them. The
// other four are objects the route hands work to, described in plain words.
// Nothing here is a mockup, and nothing here is model output.

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const STOPS = [
  {
    label: "Project Hard Disk",
    lede: "Where the work lives.",
    note: "The durable half of the desk. Projects, references, drafts and clips stay here after the tab closes.",
  },
  {
    label: "File Floppy",
    lede: "What you brought in.",
    note: "Pages, PDFs, audio, images. It is mounted, not absorbed: temporary context that the desk shows you as a disk, so you always know what the model can see.",
  },
  {
    label: "Question Sheet",
    lede: "Your questions, before any prose.",
    note: "The route asks for the real recipient, the raw questions, what you saw yourself, the objection you expect, and the friction in the handoff. Sparse input is what produces generic writing, so this stop refuses to be skipped.",
    shot: "question-sheet",
    alt: "The Question Sheet window in AI System 6, filled with a writer's own raw notes: the recipient, unanswered questions about the 240 GWh figure, an observation made on the barrage road, and the objection the writer expects.",
  },
  {
    label: "Outline",
    lede: "Structure, still in your words.",
    note: "Four sections marked with ##. The handoff below turns each one into its own draft, so the shape is decided before the sentences are.",
    shot: "outline",
    alt: "The Outline window showing four Markdown sections for the article, each with a line of the writer's intent under it.",
  },
  {
    label: "Section Drafts",
    lede: "One section at a time.",
    note: "Editing 1 of 4, eighty words in. The figure the writer could not verify is still sitting in the draft, saying so. The route never quietly resolves it for you.",
    shot: "section-drafts",
    alt: "The Section Drafts window: 80 words, editing section 1 of 4, with a paragraph that openly states the writer still cannot split the 240 GWh figure.",
  },
  {
    label: "Manuscript",
    lede: "The document itself.",
    note: "TeachText holds the manuscript. During drafting it is read-only here, and says so in the status bar: the Section Drafts own the text, so a stray command cannot rewrite the article behind your back.",
    shot: "teachtext",
    alt: "The TeachText manuscript window, 82 words across 7 paragraphs, with a status bar reading Read-only, edit in Section Drafts.",
  },
  {
    label: "Review Desk",
    lede: "The draft read back to you.",
    note: "Facts and structure, and the thing most tools will not check: whether the prose has drifted into a model's voice. Over-regular rhythm, generic summary language, personal detail flattened out.",
  },
  {
    label: "Project CD",
    lede: "Handed off.",
    note: "The finished work, pressed and exported. Markdown, PDF, slides, or a chart, and it leaves with its sources attached.",
  },
];

export function initRouteScene(stage) {
  if (!stage) return;
  stage.innerHTML = `
    <ol class="route-belt" role="tablist" aria-label="The writing route, stop by stop"></ol>
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
      mark.title = "Photographed in the running app";
      mark.setAttribute("aria-label", "photographed in the running app");
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
      caption.textContent = "Photographed in the running app. No model connected.";
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
