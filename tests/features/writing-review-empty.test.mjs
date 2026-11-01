import vm from 'node:vm';
import { createFeatureTest, read } from '../helpers/feature-test-harness.mjs';
const test = createFeatureTest('writing-review-empty');
for (const command of ['runHkrrReview()', 'runMingmingHandoffReview({mode:"card"})', 'runMingmingHandoffReview({mode:"backstage"})']) {
  const statuses=[], rendered=[], receipts=[], copied=[], ended=[];
  const context=vm.createContext({window:{AISystem6RunReceipts:{recordModelAnswer:async(v)=>{receipts.push(v);}}},
    currentLanguage:'en',activeProjectId:'p',teachTextBodyInput:{value:'# Paper\n\n## A\n\nBody'},reviewDeskBodyInput:{value:'Body'},questionSheetBodyInput:{value:''},claimResultsEl:{innerHTML:''},
    ensureTeachTextReviewState:()=>true,syncReviewDeskToTeachText:()=>true,currentReviewDeskSectionBlock:()=>({title:'A',text:'Body'}),beginLongTask:()=>true,endLongTask:(v)=>ended.push(v),
    openReviewDesk:()=>{},setClaimCheckWaiting:()=>{},setReviewDeskMode:()=>{},clearReviewFeedbackSlot:()=>{},resolveWritingRoutePrompt:()=>'',
    buildBudgetedProjectContext:async()=>'',getActiveProject:()=>({questionSheet:''}),clampPrintToAiText:s=>s,clipContextContent:s=>s,
    fetchModelPayload:async()=>({}),getLocalModelRequestName:()=> 'fixture', attachImagesToModelMessages:m=>m,withMarkdownModelMessages:m=>m,teachTextFiguresReferencedIn:()=>[],getLongTaskSignal:()=>null,
    readChatJson:async()=>({choices:[{message:{content:'  \n  '}}]}),stripRebuildMarkdownFence:s=>s,renderClaimCheckDraft:v=>rendered.push(v),appendReviewFeedbackToBody:v=>rendered.push(v),
    setStatus:v=>statuses.push(v),t:k=>k,escapeHtml:s=>s,isAbortError:()=>false,friendlyErrorDetail:e=>e.message,console,setClipboard:v=>copied.push(v),navigator:{clipboard:{writeText:async()=>{}}},
  });
  vm.runInContext(read('app/features/hkrr-review.js'),context);
  vm.runInContext(read('app/features/mingming-handoff-review.js'),context);
  await vm.runInContext(command,context);
  test.assert(statuses.at(-1)==='writing_review_empty',`${command}: empty response is reported as retryable, not success`);
  test.assert(!receipts.length && !copied.length,`${command}: no successful receipt or clipboard card for empty output`);
  test.assert(ended.length===1,`${command}: the task always releases its busy state`);
}
test.finish();
