/* Bridges the VERIFIED AISystem6Runtime.registerCommand/getCommand contract.
 * Window ownership is supplied by trusted host resolution, never by a payload documentId.
 * This dispatcher is not an authorization service or a replacement menu renderer. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClioWorksRuntimePort=api;})(globalThis,function(){
'use strict';
const installations=new WeakMap();
const error=code=>Object.assign(new Error(code),{code});
function toRuntimeResult(result){
 if(!result||!['ok','cancelled','blocked','failed'].includes(result.status))return {ok:false,reason:'INVALID_EDITOR_RESULT',status:'failed'};
 return result.status==='ok'?{ok:true,status:'ok',result}:{ok:false,status:result.status,reason:result.code||result.status,result};
}
function installRuntimePort({runtime,resolveOwner,resolveCommand,commandId='clioworks-context-command'}){
 if(typeof runtime?.registerCommand!=='function'||typeof runtime?.getCommand!=='function'||typeof resolveOwner!=='function'||typeof resolveCommand!=='function')throw error('MISSING_RUNTIME_PORT');
 if(installations.has(runtime))return installations.get(runtime);
 if(runtime.getCommand(commandId))throw error('RUNTIME_COMMAND_ID_OCCUPIED');
 const bindings=new Map();
 function target(payload){
  if(!payload||typeof payload.commandId!=='string')return null;
  // Only a command id crosses here. Raw op payloads require their separate native schema/preview.
  if(Object.keys(payload).some(k=>!['commandId'].includes(k)))return null;
  const owner=resolveOwner();const binding=bindings.get(owner);
  if(!binding||!binding.commands.some(c=>c.id===payload.commandId))return null;
  const context=binding.getContext();const state=resolveCommand(payload.commandId,context);
  return {binding,context,state};
 }
 runtime.registerCommand(commandId,{
  isAvailable:payload=>target(payload)?.state.enabled===true,
  unavailableReason:payload=>target(payload)?.state.reason||'没有可用的当前文档命令',
  handler:async payload=>{
   const t=target(payload);
   if(!t||!t.state.enabled)return {ok:false,status:'blocked',reason:t?.state.code||'NO_ACTIVE_TARGET'};
   // The mounted command path captures the engine bookmark and validates context again.
   try{return toRuntimeResult(await t.binding.execute(payload.commandId));}
   catch(e){return {ok:false,status:'failed',reason:e.code||'NATIVE_COMMAND_FAILED'};}
  }
 });
 const api=Object.freeze({
  commandId,
  menuPortFor(windowName,{openMore}={}){
   if(typeof windowName!=='string'||!windowName)throw error('INVALID_WINDOW_NAME');
   return {
    bind(binding){
     if(bindings.has(windowName))throw error('WINDOW_ALREADY_BOUND');
     if(typeof binding?.getContext!=='function'||typeof binding?.execute!=='function'||!Array.isArray(binding.commands))throw error('INVALID_BINDING');
     bindings.set(windowName,binding);let released=false;
     return()=>{if(released)return;released=true;if(bindings.get(windowName)===binding)bindings.delete(windowName);};
    },
    ...(typeof openMore==='function'?{openMore}:{}),
   };
  },
  rows(windowName){
   const b=bindings.get(windowName);if(!b)return [];
   return b.commands.map(c=>({commandId,payload:{commandId:c.id},label:c.label,group:c.group,...resolveCommand(c.id,b.getContext())}));
  },
  boundCount:()=>bindings.size,
 });
 installations.set(runtime,api);return api;
}
return Object.freeze({installRuntimePort,toRuntimeResult});
});
