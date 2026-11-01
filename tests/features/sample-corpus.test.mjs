// One editorially fixed bilingual corpus feeds Help, Rebuild, and both demos.
// It must stay offline, provenance-marked, and free of release-by-release
// measurements that would make the supposedly evergreen examples lie.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("sample-corpus");
const corpusSource = read("app/data/evergreen-demo-corpus.js");
const conceptsSource = read("app/data/system-concepts.js");
const rebuildSource = read("app/content/rebuild-samples.js");

const corpusContext = vm.createContext({ module: { exports: {} } });
corpusContext.globalThis = corpusContext;
vm.runInContext(corpusSource, corpusContext);
const corpus = corpusContext.module.exports;

test.assert(corpus.id === "ai-system6-development-story" && corpus.version === 1, "corpus has a stable id and explicit version");
for (const language of ["zh", "en"]) {
  const minimumArticleLength = language === "zh" ? 1800 : 2500;
  test.assert(corpus.artifacts.article[language].length > minimumArticleLength, `${language} article is a real long-form source`);
  test.assert(corpus.artifacts.questionSheet[language].includes(language === "zh" ? "## 接收者 / 受众" : "## Recipient / Audience"), `${language} Question Sheet keeps recipient intent`);
  test.assert(corpus.artifacts.outline[language].split(/\n##\s+/u).length >= 6, `${language} Outline has a draftable structure`);
  test.assert(corpus.artifacts.clippings[language].length >= 4, `${language} corpus has curated clippings`);
  test.assert(corpus.artifacts.docMap[language].split(/\n##\s+/u).length >= 6, `${language} DocMap has substantial branches`);
  const slides = corpus.artifacts.slides[language];
  test.assert(/^---\s*[\s\S]*?marp:\s*true/im.test(slides), `${language} slides have Marp frontmatter`);
  const slideCount = slides.split(/\n---\n/u).filter((part) => /#\s+\S/u.test(part)).length;
  test.assert(slideCount >= 9 && slideCount <= 11, `${language} deck stays within the authored 9–11 slide range`);
}
test.assert(!/iPhone 17e|A19|C1X|MagSafe/.test(corpusSource), "evergreen demos do not depend on one phone launch");
test.assert(!/2,933,688|15,432/.test(corpusSource), "evergreen artifacts do not freeze one build's changing byte measurement");
test.assertIncludes(corpusSource, "屏幕上出现过，和电脑已经保存，是两件不同的事", "Chinese source keeps the seen-versus-saved thesis");
test.assertIncludes(corpusSource, "Appearing on screen and being saved by the computer are different events", "English source keeps the seen-versus-saved thesis");

// Help builds the fixed artifacts without a model request. A tiny parser stub
// proves the async loader handoff while leaving DocMap's own parser contract to
// tests/features/docmap.test.mjs.
const conceptsContext = vm.createContext({
  console,
  window: null,
  AISystem6EvergreenDemoCorpus: corpus,
  parseDocMapMarkdown(markdown, source) {
    const headings = String(markdown).split("\n").filter((line) => /^#{1,2}\s+/.test(line));
    const nodes = Array.from({ length: 20 }, (_, index) => ({ id: `n${index}`, kind: index < 6 ? "branch" : "detail", importance: index < 6 ? 5 : 2 }));
    const edges = Array.from({ length: 20 }, (_, index) => ({ from: "central", to: `n${index}` }));
    return { title: headings[0]?.replace(/^#\s+/, "") || "DocMap", central: { title: headings[0] || "DocMap" }, nodes, edges, sourceMeta: source.meta };
  },
});
conceptsContext.window = conceptsContext;
vm.runInContext(conceptsSource, conceptsContext);
const concepts = conceptsContext.AISystem6SystemConceptsData;
const map = await concepts.buildDocMap("en");
const deck = await concepts.buildSlides("zh");
test.assert(map.sourceMeta.generationMethod === "editorial-static", "Help DocMap records an editorial-static source");
test.assert(deck.generation.method === "editorial-static", "Help slides record an editorial-static source");
test.assertNotIncludes(conceptsSource, "fetchModelPayload", "Help concepts never call a model");
test.assertNotIncludes(conceptsSource, "readChatJson", "Help concepts never parse a model response");

const rebuildContext = vm.createContext({ window: { AISystem6EvergreenDemoCorpus: corpus } });
vm.runInContext(rebuildSource, rebuildContext);
test.assert(rebuildContext.window.AISystem6Content.rebuildSampleArticles.zh === corpus.artifacts.article.zh, "Rebuild consumes the canonical Chinese article");
test.assert(rebuildContext.window.AISystem6Content.rebuildSampleArticles.en === corpus.artifacts.article.en, "Rebuild consumes the canonical English article");

test.finish();
