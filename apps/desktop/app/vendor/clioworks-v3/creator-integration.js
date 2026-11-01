/* ClioWorks v4: pure integration policies. Candidate code, not an office codec or database.
 * CommonJS for contract tests; classic script for AI System 6 / the design laboratory.
 * All durable writes remain the responsibility of the injected v3 host transaction port. */
(function(root){
'use strict';
class IntegrationError extends Error {
  constructor(code, message, detail = {}) { super(message); this.name='IntegrationError'; this.code=code; this.detail=detail; }
}
function fail(code, message, detail){ throw new IntegrationError(code,message,detail); }
function canonical(value, depth=0, seen=new Set()) {
  if(depth>64) fail('DATA_DEPTH','数据层级超过限制');
  if(value===null || typeof value==='string' || typeof value==='boolean') return JSON.stringify(value);
  if(typeof value==='number') { if(!Number.isFinite(value)) fail('NON_FINITE','数字必须有限'); return JSON.stringify(value); }
  if(typeof value!=='object' || (!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)) fail('NON_JSON','只允许纯 JSON 数据');
  if(seen.has(value)) fail('DATA_CYCLE','数据不能包含循环');
  seen.add(value);
  let result;
  if(Array.isArray(value)) result='['+Array.from(value,v=>canonical(v,depth+1,seen)).join(',')+']';
  else result='{'+Object.keys(value).sort().map(k=>{
    if(['__proto__','prototype','constructor'].includes(k)) fail('UNSAFE_KEY','字段名称不可用');
    return JSON.stringify(k)+':'+canonical(value[k],depth+1,seen);
  }).join(',')+'}';
  seen.delete(value); return result;
}
const copy=value=>JSON.parse(canonical(value));
const equal=(a,b)=>canonical(a)===canonical(b);
function immutable(value){ if(value&&typeof value==='object'){Object.values(value).forEach(immutable);Object.freeze(value);}return value; }
function identity(doc){ return {id:doc.id, generation:doc.generation, revision:doc.revision}; }
function checkDocument(doc){
  if(!doc||typeof doc.id!=='string'||!doc.id||typeof doc.scope!=='string'||!doc.scope) fail('DOCUMENT_ID','缺少文件身份');
  if(!Number.isSafeInteger(doc.generation)||doc.generation<1||!Number.isSafeInteger(doc.revision)||doc.revision<0) fail('DOCUMENT_REVISION','文件版本无效');
  canonical(doc); return doc;
}
function projectImpacts(documents, edges, changedIds){
  const byId=new Map(documents.map(d=>[checkDocument(d).id,d]));
  if(byId.size!==documents.length) fail('DUPLICATE_ID','文件身份重复');
  const edgeIds=new Set();
  for(const e of edges){if(!e||typeof e.id!=='string'||!e.id||edgeIds.has(e.id))fail('EDGE_ID','关系身份缺失或重复');edgeIds.add(e.id);}
  const ids=new Set(); const result=[]; const reached=new Set(changedIds); const queue=[...changedIds];
  while(queue.length){
    const sourceId=queue.shift();
    for(const edge of edges.filter(e=>e.sourceId===sourceId)){
      if(ids.has(edge.id)) continue;
      ids.add(edge.id); const source=byId.get(edge.sourceId), target=byId.get(edge.targetId);
      if(!target){result.push({...copy(edge),status:'target-missing',selectable:false});continue;}
      let status;
      if(edge.targetGeneration!==target.generation) status='target-replaced';
      else if(target.frozen || edge.mode==='frozen') status='frozen';
      else if(!source) status='source-missing';
      else if(source.generation!==edge.sourceGeneration) status='source-replaced';
      else if(source.revision===edge.adoptedRevision || source.revision===edge.keptRevision) status='current';
      else if(edge.locallyEdited) status='local-conflict';
      else status='update-available';
      const indirect=!changedIds.includes(edge.sourceId);
      // A downstream projection is only suspected until its immediate source is rebuilt.
      if(indirect&&status==='current') status='upstream-pending';
      result.push({...copy(edge),status,indirect,sourceRevision:source?.revision??null,targetRevision:target.revision,selectable:status==='update-available'&&!indirect});
      if(!['frozen','target-missing','target-replaced','source-missing','source-replaced'].includes(status)&&!reached.has(target.id)){reached.add(target.id);queue.push(target.id);}
    }
  }
  return result;
}
/** A plan contains full candidate snapshots only in this small reference layer.
 * Production adapters use model-native operations and v3 assets, never a universal office AST. */
function preparePlan({operationId,documents,replacements,readIds=[],label='更新选中内容'}){
  if(typeof operationId!=='string'||!operationId) fail('OPERATION_ID','操作缺少身份');
  if(!Array.isArray(replacements)||!replacements.length) fail('EMPTY_PLAN','没有选中改动');
  const byId=new Map(documents.map(d=>[checkDocument(d).id,d]));
  if(byId.size!==documents.length) fail('DUPLICATE_ID','文件身份重复');
  const written=new Set(), scopeSet=new Set();
  const writes=replacements.map(r=>{
    if(written.has(r.id))fail('DUPLICATE_WRITE','一个文件在同一计划中只能提交一次');
    written.add(r.id);const before=byId.get(r.id);
    if(!before)fail('MISSING_DOCUMENT','目标文件不存在');
    if(before.readonly||before.frozen)fail('READ_ONLY','目标文件不能修改');
    if(before.revision===Number.MAX_SAFE_INTEGER)fail('REVISION_EXHAUSTED','文件版本需要迁移，不能继续递增');
    scopeSet.add(before.scope);const after=copy(before);after.body=copy(r.body);after.revision=before.revision+1;
    return {id:before.id, before:copy(before.body), after:after.body};
  });
  if(scopeSet.size!==1)fail('CROSS_SCOPE_WRITE','跨项目写入需分别生成复制和接收计划');
  const scope=[...scopeSet][0];
  const required=[...new Set([...written,...readIds])].sort();
  const reads=required.map(id=>{
    const d=byId.get(id);if(!d)fail('MISSING_DOCUMENT','依赖文件不存在');
    if(d.scope!==scope)fail('CROSS_SCOPE_READ','依赖未在当前项目授权范围内');
    return {...identity(d), fingerprint:canonical(d.body)};
  });
  const plan={schema:1,operationId,label,scope,reads,writes};
  return immutable({...plan,seal:canonical(plan)});
}
function validatePlan(plan){
  if(!plan||plan.schema!==1)fail('PLAN_SCHEMA','计划版本无效');
  const {seal,...body}=plan;
  if(canonical(body)!==seal)fail('PLAN_CHANGED','预览之后计划被更改');
  return plan;
}
/** Authority object must stay inside the trusted host; this is not a postMessage token.
 * Tests / demo call issue after a visible decision. A remote model must never receive this API. */
function createGrantVault({now=()=>Date.now(),ttl=60000}={}){
  const grants=new WeakMap();
  return Object.freeze({
    issue(plan){validatePlan(plan);const token=Object.freeze({});grants.set(token,{seal:plan.seal,scope:plan.scope,expires:now()+ttl});return token;},
    consume(token,plan){validatePlan(plan);const found=token&&grants.get(token);
      if(!found||found.seal!==plan.seal||found.scope!==plan.scope)fail('CONSENT_REQUIRED','需要对此次改动的宿主确认');
      grants.delete(token);if(found.expires<now())fail('CONSENT_EXPIRED','确认已过期，请重新预览');return true;
    }
  });
}
async function executePlan(plan,{grant,vault,port,signal}){
  validatePlan(plan); if(signal?.aborted)fail('CANCELLED','操作已取消');
  if(!port||typeof port.commit!=='function'||!vault)fail('HOST_PORT_REQUIRED','需要真实宿主事务端口');
  vault.consume(grant,plan);
  // commit MUST recheck scope, generation, revisions, writer fence and readset atomically.
  // It also checks cancellation immediately before the durable transaction begins.
  const result=await port.commit(plan,{signal});
  if(!result||!['ok','blocked','failed','cancelled'].includes(result.status))fail('BAD_RECEIPT','宿主未返回明确结果');
  return result;
}
function threeWayBlocks(base,local,incoming,{protectedIds=[]}={}){
  const validate=list=>{const ids=new Set();for(const b of list){if(!b||typeof b.id!=='string'||typeof b.text!=='string'||ids.has(b.id))fail('BLOCK_ID','段落身份或文字无效');ids.add(b.id);}return new Map(list.map(b=>[b.id,b]));};
  const a=validate(base),b=validate(local),c=validate(incoming),keys=[...new Set([...a.keys(),...b.keys(),...c.keys()])];
  const text=v=>v?v.text:null;
  const protectedSet=new Set(protectedIds);
  return keys.map(id=>{
    const old=text(a.get(id)),here=text(b.get(id)),there=text(c.get(id));let status;
    if(old===null)status=here===there?'same-addition':'structure-review';
    else if(there===old)status='keep-local';
    else if(here===there)status='converged';
    else if(protectedSet.has(id))status='protected-conflict';
    else if(here===old)status=there===null?'delete-review':'incoming-only';
    else status='conflict';
    return {id,base:old,local:here,incoming:there,status};
  });
}
function buildRelease({releaseId,documents,selectedIds,artifacts,profile='public',capturedAt,disclosePrivate=false}){
  if(!['public','review','archive'].includes(profile))fail('PROFILE','交付范围无效');
  if(!releaseId||!capturedAt||!selectedIds.length)fail('RELEASE_ID','交付需要身份、时间和选中的文件');
  const byId=new Map(documents.map(d=>[checkDocument(d).id,d]));
  if(byId.size!==documents.length) fail('DUPLICATE_ID','交付文件身份重复');
  const selected=[...new Set(selectedIds)].map(id=>{const d=byId.get(id);if(!d)fail('MISSING_DOCUMENT','交付文件不存在');return d;});
  // The distributable receipt must not contain private model text disguised as a fingerprint.
  const snapshots=selected.map(d=>identity(d));
  const results=[];
  for(const art of artifacts){
    if(!selectedIds.includes(art.documentId))fail('UNSELECTED_ARTIFACT','产物不属于选中文件');
    const d=byId.get(art.documentId);
    if(art.revision!==d.revision||art.generation!==d.generation)fail('STALE_ARTIFACT','产物不是捕获版本');
    if(art.status!=='verified')fail('UNVERIFIED_ARTIFACT','产物没有通过规定的内容检查');
    if(!/^[a-f0-9]{64}$/.test(art.sha256||''))fail('MISSING_DIGEST','产物缺少实际字节摘要');
    if(profile!=='archive'&&art.privateContent&&!disclosePrivate)fail('PRIVATE_CONTENT','产物含有未批准的内部信息');
    if(!art.path||art.path.startsWith('/')||art.path.includes('\\')||art.path.split('/').some(x=>x==='..'||!x))fail('ARTIFACT_PATH','交付路径无效');
    if(results.some(a=>a.path===art.path))fail('DUPLICATE_PATH','交付文件路径重复');
    if(typeof art.privateContent!=='boolean')fail('PRIVACY_UNVERIFIED','产物隐私检查尚未登记');
    const permitted=new Set(['path','documentId','generation','revision','status','sha256','privateContent']);
    if(Object.keys(art).some(k=>!permitted.has(k)))fail('ARTIFACT_METADATA','公开收据不能携带额外私有字段');
    results.push(copy(art));
  }
  if(!results.length)fail('EMPTY_RELEASE','没有可交付产物');
  for(const d of selected)if(!results.some(a=>a.documentId===d.id))fail('MISSING_ARTIFACT','选中文件缺少产物');
  return immutable({schema:1,releaseId,profile,capturedAt,snapshots,artifacts:results});
}
function formatDecision({nativeFormat,targetFormat,changed=false,features=[],operation}){
  if(!changed&&nativeFormat===targetFormat)return {mode:'original-bytes',allowed:true,notices:[]};
  const notices=[];let allowed=true;
  for(const f of features){
    if(!['editable','preserve','convert','unsupported','unknown'].includes(f.save))fail('FEATURE_STATE','格式能力未明确登记');
    const touched=Boolean(operation?.objectId)&&operation.objectId===f.objectId;
    if(f.save==='unknown'){allowed=false;notices.push({id:f.id,kind:'block',message:'尚未验证保存能否保留此内容'});}
    else if(f.save==='unsupported'){allowed=false;notices.push({id:f.id,kind:'block',message:'当前保存路径不能保留此内容'});}
    else if(f.save==='convert'||(f.save==='preserve'&&touched&&!['move','resize'].includes(operation?.type))){
      allowed=false;notices.push({id:f.id,kind:'conversion-required',message:'需要转换副本，原件保持不变'});
    }
    if(f.render==='approximate')notices.push({id:f.id,kind:'display-only',message:'此处显示近似，保存能力需另外判断'});
  }
  if(nativeFormat!==targetFormat)notices.push({id:'format',kind:'conversion',message:'格式转换不宣称无损，需生成逐项能力报告'});
  return {mode:nativeFormat===targetFormat?'preserving-edit':'conversion-copy',allowed,notices};
}
/** Caption timing is never inferred from word count. Use aligned/recorded ranges only. */
function captionSrt(cues){
  const time=n=>{const ms=Math.round(n),s=Math.floor(ms/1000);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
  let end=0;
  return cues.map((c,i)=>{
    if(!['recorded','aligned'].includes(c.timingBasis))fail('ESTIMATED_TIMING','估算口播时长不能生成正式字幕');
    if(!Number.isSafeInteger(c.startMs)||!Number.isSafeInteger(c.endMs)||c.startMs<end||c.endMs<=c.startMs)fail('CAPTION_RANGE','字幕时间无效或重叠');
    if(typeof c.text!=='string'||!c.text.trim())fail('CAPTION_TEXT','字幕文字为空');
    end=c.endMs;return `${i+1}\n${time(c.startMs)} --> ${time(c.endMs)}\n${c.text.trim()}\n`;
  }).join('\n');
}
const api=Object.freeze({IntegrationError,canonical,copy,equal,immutable,identity,checkDocument,projectImpacts,preparePlan,validatePlan,createGrantVault,executePlan,threeWayBlocks,buildRelease,formatDecision,captionSrt});
root.ClioWorksIntegration=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
