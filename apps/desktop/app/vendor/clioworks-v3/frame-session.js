/* A bounded, one-level embedded-object edit session. Opaque native handles stay in the adapter.
 * UI checks are not authorization. The native commit must recheck its actual writer fence,
 * permissions, input/output identities and all revisions in the owning transaction. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClioWorksFrames=api;})(globalThis,function(){
'use strict';
const error=(code)=>Object.assign(new Error(code),{code});
const identity=['documentId','sessionId','generation'];
const version=[...identity,'editRevision','objectId','objectRevision'];
function stamp(s){
 if(!s)throw error('INVALID_STAMP');
 for(const k of ['documentId','sessionId','objectId'])if(typeof s[k]!=='string'||!s[k])throw error('INVALID_STAMP');
 for(const k of ['generation','editRevision','objectRevision'])if(!Number.isSafeInteger(s[k])||s[k]<0)throw error('INVALID_STAMP');
 return Object.freeze(Object.fromEntries(version.map(k=>[k,s[k]])));
}
const same=(a,b,keys=version)=>!!a&&!!b&&keys.every(k=>a[k]===b[k]);
class FrameSession {
 constructor(port,{onChange=()=>{},onCleanupError=()=>{}}={}){
  for(const k of ['readTarget','createDraft','editDraft','prepare','commit','disposeDraft'])
   if(typeof port?.[k]!=='function')throw error('MISSING_PORT_'+k);
  if(typeof onChange!=='function'||typeof onCleanupError!=='function')throw error('INVALID_CALLBACK');
  this.port=port;this.onChange=onChange;this.onCleanupError=onCleanupError;this.state='idle';
  this.serial=0;this.base=null;this.handle=null;this.dirty=false;this.draftRevision=0;
  this.candidate=null;this.pending=null;this.disposed=false;this.lastCode='';this.commitAttempt=null;
 }
 snapshot(){return Object.freeze({state:this.state,base:this.base,dirty:this.dirty,draftRevision:this.draftRevision,
   hasCandidate:!!this.candidate,summary:this.candidate?.summary||'',code:this.lastCode,requestId:this.commitAttempt?.requestId||null});}
 report(error){try{this.onCleanupError(error);}catch{/* An observer must never change a native transaction's outcome. */}}
 emit(code=''){this.lastCode=code;try{this.onChange(this.snapshot());}catch(e){this.report(e);}}
 live(){const x=this.port.readTarget();stamp(x);return x;}
 eligible(x){return !x.closed && x.active===true && x.writable===true && x.embedded===true && x.editable===true && x.composing!==true;}
 current(){try{return same(this.base,this.live());}catch{return false;}}
 async open(objectId){
  if(this.disposed)return {status:'blocked',code:'DISPOSED'};
  if(this.state!=='idle')return {status:'blocked',code:'FRAME_ALREADY_OPEN'};
  const target=this.live();if(target.objectId!==objectId||!this.eligible(target))return {status:'blocked',code:'TARGET_NOT_EDITABLE'};
  this.base=stamp(target);this.state='opening';const serial=++this.serial;const ac=new AbortController();this.pending=ac;this.emit();
  let draft;
  try{
   draft=await this.port.createDraft({target:this.base,signal:ac.signal});
   if(!draft||!Object.prototype.hasOwnProperty.call(draft,'handle')||draft.handle==null)throw error('INVALID_DRAFT');
   if(this.disposed||serial!==this.serial||ac.signal.aborted||!this.current()||!this.eligible(this.live())){
    this.release(draft.handle);if(!this.disposed&&serial===this.serial){this.state='idle';this.emit('STALE_OPEN');}
    return {status:'blocked',code:'STALE_OPEN'};
   }
   this.handle=draft.handle;this.dirty=false;this.draftRevision=0;this.state='editing';this.emit();return {status:'ok'};
  }catch(e){if(!this.disposed&&serial===this.serial){this.state='idle';this.emit(e.code||'OPEN_FAILED');}return {status:'failed',code:e.code||'OPEN_FAILED'};}
  finally{if(this.pending===ac)this.pending=null;}
 }
 edit(op){
  if(this.disposed)return {status:'blocked',code:'DISPOSED'};
  if(!['editing','review','failed','conflict'].includes(this.state))return {status:'blocked',code:'FRAME_BUSY'};
  let live;try{live=this.live();}catch{this.state='conflict';this.emit('TARGET_CHANGED');return {status:'blocked',code:'TARGET_CHANGED'};}if(live.composing)return {status:'blocked',code:'COMPOSING'};
  if(!this.eligible(live)||!this.current()){this.state='conflict';this.emit('TARGET_CHANGED');return {status:'blocked',code:'TARGET_CHANGED'};}
  // Native adapter validates the op schema and changes only its uncommitted draft.
  const r=this.port.editDraft(this.handle,op);
  if(!r||typeof r.changed!=='boolean'||typeof r.dirty!=='boolean'||typeof r.then==='function')throw error('INVALID_EDIT_RESULT');
  if(r.changed)this.draftRevision++;
  this.dirty=r.dirty;this.candidate=null;this.state='editing';this.emit();return {status:'ok',changed:r.changed};
 }
 async prepare(){
  if(this.disposed)return {status:'blocked',code:'DISPOSED'};
  if(!['editing','failed'].includes(this.state)||!this.dirty)return {status:'blocked',code:'NOT_READY'};
  if(!this.current()||!this.eligible(this.live())){this.state='conflict';this.emit('TARGET_CHANGED');return {status:'blocked',code:'TARGET_CHANGED'};}
  const ac=new AbortController();this.pending=ac;const serial=this.serial;const rev=this.draftRevision;this.state='preparing';this.emit();
  try{
   const r=await this.port.prepare(this.handle,{expected:this.base,draftRevision:rev,signal:ac.signal});
   if(this.disposed||serial!==this.serial||ac.signal.aborted)return {status:'blocked',code:'CANCELLED_PREPARATION'};
   if(!r||!r.candidate||typeof r.summary!=='string')throw error('INVALID_PREPARE_RESULT');
   if(rev!==this.draftRevision||!this.current()||!this.eligible(this.live())){this.state='conflict';this.emit('TARGET_CHANGED');return {status:'blocked',code:'TARGET_CHANGED'};}
   this.candidate={native:r.candidate,summary:r.summary,draftRevision:rev};this.state='review';this.emit();return {status:'ok',summary:r.summary};
  }catch(e){if(!this.disposed&&serial===this.serial){this.state='failed';this.emit(e.code||'PREPARE_FAILED');}return {status:'failed',code:e.code||'PREPARE_FAILED'};}
  finally{if(this.pending===ac)this.pending=null;}
 }
 async accept({requestId}={}){
  if(this.disposed)return {status:'blocked',code:'DISPOSED'};
  if(this.state!=='review'||!this.candidate)return {status:'blocked',code:'NO_REVIEWED_CANDIDATE'};
  if(typeof requestId!=='string'||!requestId)return {status:'blocked',code:'MISSING_REQUEST_ID'};
  if(!this.current()||!this.eligible(this.live())){this.state='conflict';this.emit('TARGET_CHANGED');return {status:'blocked',code:'TARGET_CHANGED'};}
  const ac=new AbortController();this.pending=ac;const serial=this.serial;const base=this.base;const candidate=this.candidate;
  this.commitAttempt={expected:base,requestId};this.state='committing';this.emit();
  try{
   const r=await this.port.commit({candidate:candidate.native,expected:base,draftRevision:candidate.draftRevision,requestId,signal:ac.signal});
   if(!r||!['applied','blocked','failed'].includes(r.status))throw error('INVALID_COMMIT_RECEIPT');
   if(r.status==='applied'){
    if(!this.validReceipt(base,r))
      throw error('INVALID_COMMIT_RECEIPT');
    // Disposal cannot undo a commit which actually landed. Report receipt, never fake cancellation.
    const detached=this.disposed||serial!==this.serial;
    if(!detached){this.reset();this.emit('APPLIED_NOT_SAVED');}
    return {status:'ok',receipt:r,detached};
   }
   if(!this.disposed&&serial===this.serial){this.state=r.status==='blocked'?'conflict':'failed';this.candidate=null;this.commitAttempt=null;this.emit(r.code||'COMMIT_FAILED');}
   return {status:r.status,code:r.code||'COMMIT_FAILED'};
  }catch(e){if(!this.disposed&&serial===this.serial){this.state='uncertain';this.candidate=null;this.emit('COMMIT_OUTCOME_UNKNOWN');}return {status:'failed',code:'COMMIT_OUTCOME_UNKNOWN'};}
  finally{if(this.pending===ac)this.pending=null;}
 }
 validReceipt(base,r){return same(base,r,identity)&&r.objectId===base.objectId&&Number.isSafeInteger(r.editRevision)&&r.editRevision>base.editRevision&&typeof r.operationId==='string'&&!!r.operationId;}
 async reconcile(){
  if(this.disposed)return {status:'blocked',code:'DISPOSED'};
  if(this.state!=='uncertain'||!this.commitAttempt)return {status:'blocked',code:'NOT_UNCERTAIN'};
  if(typeof this.port.lookupCommit!=='function')return {status:'blocked',code:'HOST_RECONCILIATION_REQUIRED'};
  const attempt=this.commitAttempt,serial=this.serial;this.state='reconciling';this.emit();
  try{
   const r=await this.port.lookupCommit(attempt);
   if(this.disposed||serial!==this.serial)return {status:'blocked',code:'DISPOSED'};
   if(r?.status==='applied'&&this.validReceipt(attempt.expected,r)){
    this.reset();this.emit('APPLIED_NOT_SAVED');return {status:'ok',receipt:r};
   }
   // Only an authoritative terminal rejection permits a new request. "Not found" is not terminal.
   if(r?.status==='not-applied'&&r.terminal===true){
    this.commitAttempt=null;this.state=this.current()?'editing':'conflict';this.emit('NOT_APPLIED');return {status:'ok',applied:false};
   }
   this.state='uncertain';this.emit('COMMIT_OUTCOME_UNKNOWN');return {status:'blocked',code:'RECONCILE_REQUIRED'};
  }catch{if(!this.disposed&&serial===this.serial){this.state='uncertain';this.emit('COMMIT_OUTCOME_UNKNOWN');}return {status:'failed',code:'RECONCILE_FAILED'};}
 }
 isComposing(){try{return this.live().composing===true;}catch{return false;}}
 requestExit(){
  if(this.disposed)return {status:'blocked',code:'DISPOSED'};
  if(this.isComposing())return {status:'blocked',code:'COMPOSING'};
  if(['committing','uncertain','reconciling'].includes(this.state))return {status:'blocked',code:this.state==='uncertain'?'RECONCILE_REQUIRED':'COMMIT_BUSY'};
  if(this.dirty)return {status:'needs-decision',choices:['keep-editing','discard','review']};
  this.reset();this.emit();return {status:'ok'};
 }
 discard(){
  if(['committing','uncertain','reconciling'].includes(this.state))return {status:'blocked',code:this.state==='uncertain'?'RECONCILE_REQUIRED':'COMMIT_BUSY'};
  if(this.disposed)return {status:'blocked',code:'DISPOSED'};
  if(this.isComposing())return {status:'blocked',code:'COMPOSING'};
  this.reset();this.emit();return {status:'ok'};
 }
 release(handle){if(handle==null)return;try{this.port.disposeDraft(handle);}catch(e){this.report(e);}}
 reset(){++this.serial;this.pending?.abort();this.pending=null;this.release(this.handle);this.handle=null;this.candidate=null;this.dirty=false;this.draftRevision=0;this.base=null;this.commitAttempt=null;this.state='idle';}
 dispose(){if(this.disposed)return;this.disposed=true;this.reset();this.state='disposed';}
}
return Object.freeze({FrameSession,stamp,same});
});
