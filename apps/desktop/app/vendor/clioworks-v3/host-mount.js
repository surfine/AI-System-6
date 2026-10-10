/* Proposed native-host mount, not an existing AISystem6 API. No demo, DB or window creation.
 * The caller supplies its REAL editor and existing menu registration. See docs/NATIVE-INTEGRATION.
 * Caller adapters must revalidate identities/authority after async work: UI gates are not authorization. */
(function(root){
'use strict';
const D=root.ClioWorksDOM,U=root.ClioWorksComponents,C=root.ClioWorksCore;
function mountNative({element,adapter,menuPort,hostWindow=root,onError=()=>{},onTheme=()=>{}}){
 if(!element?.isConnected)throw new Error('先把挂载区域放进宿主现有文档窗口。');
 for(const key of ['getContext','execute','subscribe','mountEditor'])if(typeof adapter?.[key]!=='function')throw new Error(`adapter.${key} 必须由真实编辑器实现。`);
 if(!menuPort||typeof menuPort.bind!=='function')throw new Error('请提供宿主菜单的 bind 接口，不另造应用菜单栏。');
 if(element.querySelector('[data-cw-mounted]'))throw new Error('此区域已有一个 ClioWorks 界面。');
 const bag=D.disposable();let gone=false,pendingSelection=null,composing=false,toolbar;
 const operations=new Map();
 const surface=D.h('div',{class:'cw-root cw-workspace cw-native',dataset:{cwMounted:'true'}}),editor=D.h('div',{class:'cw-editor-area'});
 const ctx=()=>{const current=adapter.getContext();return {...current,composing:composing||!!current.composing};};
 const sameFile=(a,b)=>['documentId','sessionId','generation'].every(k=>a[k]!==undefined&&a[k]===b[k]);
 async function run(id){
  if(gone)return {status:'blocked',code:'DISPOSED'};
  const initial=ctx(),state=C.commandState(id,initial);
  if(!state.enabled)return {status:'blocked',code:'COMMAND_DISABLED',message:state.reason};
  if(operations.has(id))return {status:'blocked',code:'COMMAND_BUSY'};
  // Read an engine bookmark, never DOM ranges of a rich editor. A toolbar bookmark is single-use.
  const bookmark=pendingSelection??adapter.readSelection?.();pendingSelection=null;
  const controller=new AbortController();operations.set(id,controller);
  try{
   const result=await adapter.execute(id,{selection:bookmark,signal:controller.signal});
   if(!result||!['ok','cancelled','blocked','failed'].includes(result.status))
    throw Object.assign(new Error('编辑器必须返回明确的命令结果。'),{code:'INVALID_COMMAND_RESULT'});
   if(gone||controller.signal.aborted)return {status:'blocked',code:'DISPOSED'};
   const current=ctx();
   // Do not let an old command steal a later edit's selection, or focus a different file.
   // Mutating adapters may return selection + selectionRevision for their own new state.
   if(result.status==='ok'&&sameFile(initial,current)){
    const revision=result.selectionRevision??initial.editRevision;
    if(Number.isInteger(revision)&&current.editRevision===revision&&
      current.selectionEpoch!==undefined&&current.selectionEpoch===initial.selectionEpoch)
      adapter.restoreSelection?.(result.selection??bookmark);
   }
   return result;
  }catch(error){if(!gone)onError(error);return {status:'failed',code:error.code||'COMMAND_FAILED'};}
  finally{operations.delete(id);if(!gone)toolbar?.refresh();}
 }
 function dispose(){
  if(gone)return;gone=true;for(const op of operations.values())op.abort();operations.clear();
  // One throwing integration cleanup must not keep the remaining listeners/editors alive.
  try{bag.dispose();}finally{surface.remove();}
 }
 try{
  const kind=ctx().kind;
  const items=[{id:'view.outline',label:'导航'},{id:'file.save'},'separator',{id:'object.insert'},{id:'comment.open',optional:true},{id:'format.open'},'separator',{id:kind==='stage'?'stage.present':'ask.open',optional:true},{id:'file.export',optional:true}];
  toolbar=U.createToolbar({items,getContext:ctx,onCommand:(id,anchor)=>id==='menu.more'?menuPort.openMore?.({anchor,context:ctx(),execute:run}):run(id)});
  bag.add(()=>toolbar.dispose());
  if(typeof menuPort.openMore!=='function'){const more=toolbar.element.querySelector('.cw-more');more.disabled=true;more.title='宿主菜单扩展尚未连接。';}
  surface.append(toolbar.element,editor);element.append(surface);
  const theme=root.ClioWorksThemeBridge.attachNativeTheme({element:surface,hostWindow,onChange:onTheme,onError});bag.add(()=>theme.dispose());
  const mounted=adapter.mountEditor(editor);
  if(!mounted||typeof mounted.dispose!=='function')throw new Error('mountEditor 必须返回可释放的编辑会话。');
  bag.add(()=>mounted.dispose());
  const unbind=menuPort.bind({getContext:ctx,execute:run,commands:C.COMMANDS});
  if(typeof unbind!=='function')throw new Error('menuPort.bind 必须返回取消注册函数。');
  bag.add(unbind);
  const unsubscribe=adapter.subscribe(()=>toolbar.refresh());
  if(typeof unsubscribe!=='function')throw new Error('adapter.subscribe 必须返回取消订阅函数。');
  bag.add(unsubscribe);
  bag.on(surface,'compositionstart',()=>{composing=true;toolbar.refresh();},true);
  bag.on(surface,'compositionend',()=>{composing=false;toolbar.refresh();},true);
  bag.on(toolbar.element,'pointerdown',()=>{pendingSelection=adapter.readSelection?.();},true);
  bag.on(editor,'focusin',()=>{pendingSelection=null;},true);
  return {surface,editor,ready:theme.ready,execute:run,refresh:()=>toolbar.refresh(),dispose};
 }catch(error){dispose();throw error;}
}
root.ClioWorksHost=Object.freeze({mountNative});
})(globalThis);
