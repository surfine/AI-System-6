import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-studio-usability");
const vmw = createAppBootVm();
vmw.run(`
  projects.length = 0;
  projects.push({id:"studio",name:"Paper",questionSheet:"作者：Aaron\\n接收者：落落\\n媒介：专栏文章",outline:"# Paper\\n\\n## First\\n\\nalpha\\n\\n## Second\\n\\nbeta\\n\\n## Third\\n\\ngamma",drafts:[],scraps:[],flowState:{}});
  activeProjectId = "studio"; isProjectMounted = true;
  saveDeskState = async () => true;
`);
await vmw.run("ensureWritingFlowModule()");
vmw.run("renderPipeline(); syncDraftsFromProjectOutline(getActiveProject()); selectedDraftIndex = 0; renderPipeline();");
const draft = vmw.run("draftBodyInput");
vmw.typeInto(draft, "alpha AUTHOR EDITS");
vmw.typeInto(vmw.run("draftSectionSelectEl"), "2");
test.assert(draft.value === "gamma", "section picker jumps directly to the selected body");
test.assert(vmw.run("getActiveProject().outline").includes("alpha AUTHOR EDITS"), "changing the picker preserves the section just edited");
test.assert(!vmw.run("canNavigateSectionDraft(1)"), "last section has no next section");
test.assert(vmw.run("showAdjacentSectionDraft(1)") === false && draft.value === "gamma", "next at the end does not wrap to the first section");
vmw.run("showAdjacentSectionDraft(-1)");
test.assert(draft.value === "beta", "previous navigates by one section");
vmw.run("selectSectionDraft(0)");
test.assert(draft.value === "alpha AUTHOR EDITS" && !vmw.run("canNavigateSectionDraft(-1)"), "returning preserves the first section and disables its previous action");
test.assert(vmw.run("selectSectionDraft(-1)") === false && vmw.run("selectSectionDraft(99)") === false, "invalid picker indices cannot select or change a document");
vmw.run("updateDraftVoiceStats('一段文字')");
test.assert(vmw.run("draftCountEl.textContent") === vmw.run("t('draft_word_stats', countTextWords('一段文字'))"), "an article shows word count without narration timing");
vmw.run("getActiveProject().questionSheet = '媒介：口播稿'; updateDraftVoiceStats('一段文字');");
test.assert(vmw.run("draftCountEl.textContent") !== vmw.run("t('draft_word_stats', countTextWords('一段文字'))"), "an explicit spoken script includes narration timing");
vmw.run("getActiveProject().authorLocks = [{ target: 'title' }]; getActiveProject().questionSheet = '媒介：文章'; updateDraftVoiceStats('正文');");
test.assert(!!vmw.run("draftCountEl.textContent"), "displaying word count does not require resolvable generation locks");
test.assert(vmw.run("questionSheetFirstGap('这篇写给落落，我想说明接口与协议的差别。')") === "", "freeform intent is accepted without template headings");
test.assert(vmw.run("questionSheetCellText('一次观察')") === vmw.run("t('question_sheet_notes')"), "notes are called notes rather than zero questions");

// Review's own empty-state action can start review, while an empty final
// document still has an actionable route back to writing.
vmw.run(`
  teachTextDocumentRole = "manuscript";
  teachTextWorkflowState = "draft";
  teachTextBodyInput.value = "# Paper\\n\\n正文";
  currentWritingRouteStop = () => "reviewDesk";
  updateMenuState();
`);
test.assert(vmw.run("getActionAvailability()['advance-manuscript-to-review']"), "the review route can advance a nonempty manuscript into review");
vmw.run("teachTextWorkflowState = 'final'; teachTextBodyInput.value = ''; syncReviewDeskAvailability();");
test.assert(!vmw.run("isReviewDeskLinkedToFinal()"), "an empty final manuscript does not unlock empty review tools");
// Direct entry into Section Drafts must also hand off correctly when TeachText
// still belongs to a separate scratch note, without erasing that note.
vmw.run(`
  currentWritingRouteStop = () => "sectionDrafts";
  teachTextWorkflowState = "draft"; teachTextFileLabel = "draft";
  getActiveProject().manuscriptOwnsDraft = false;
  getActiveProject().authorLocks = [];
  const scratch = upsertDocumentTab("teachText", "scratch_file", {title:"Notes", state:{body:"SCRATCH MUST SURVIVE", label:"draft",workflowState:"draft"},forceNew:true});
  loadTeachTextTabState(scratch);
  createDocumentRevision = async () => ({ id:"version" });
  openWindow = async () => {};
  renderPipeline();
`);
await vmw.run("advanceDraftsToManuscript()");
test.assert(vmw.run("manuscriptPhase()") === "manuscript", "direct section entry advances to the manuscript phase");
test.assert(vmw.run("teachTextBodyInput.value").includes("alpha AUTHOR EDITS"), "handing off from a scratch tab fills the manuscript with the drafted sections");
test.assert(vmw.run("getDocumentTabs('teachText').find(tab => tab.role === 'scratch_file').state.body") === "SCRATCH MUST SURVIVE", "handoff preserves the separate scratch note");
vmw.run(`
  getActiveProject().manuscriptOwnsDraft = false;
  teachTextWorkflowState = "draft";
  window.__historyHeld = false;
  createDocumentRevision = async () => { window.__historyHeld = true; await new Promise(resolve => { window.__releaseHistory = resolve; }); };
  window.__advancing = advanceDraftsToManuscript();
`);
await vmw.waitFor(() => vmw.run("window.__historyHeld"));
vmw.run(`
  projects.push({id:"other-studio", name:"Other", outline:"", drafts:[],flowState:{}});
  activeProjectId = "other-studio";
  teachTextBodyInput.value = "OTHER AUTHOR'S TEXT";
  window.__releaseHistory();
`);
await vmw.run("window.__advancing");
test.assert(vmw.run("projects.find(project => project.id === 'studio').manuscriptOwnsDraft") === false, "a project switch during version persistence cancels phase transfer");
test.assert(vmw.run("teachTextBodyInput.value") === "OTHER AUTHOR'S TEXT", "cancelled phase transfer leaves the new editor untouched");
test.finish();
