/* Extension of the v3 mount: one context strip, no second shell, menu, editor or database. */
(function(root){
'use strict';
function attachContextStrip({mounted,adapter,onError=()=>{}}){
 const D=root.ClioWorksDOM,U=root.ClioWorksComponents,M=root.ClioWorksUIModel;
 if(!mounted?.editor?.isConnected||typeof mounted.execute!=='function')throw new Error('Existing v3 native mount required');
 const bar=D.h('div',{class:'cw5-context',role:'toolbar','aria-label':'当前对象工具'});
 const label=D.h('span',{class:'cw5-context-label'});bar.append(label);
 const map=new Map(), bag=D.disposable();let dead=false;
 for(const command of M.CATALOG.filter(c=>['embed.edit','source.inspect','source.open','object.arrange','text.bold','table.format','chart.kind','image.crop','layout.check'].includes(c.id))){
  const b=U.button({label:command.label,icon:command.icon,attrs:{dataset:{cw5Command:command.id}},onClick:()=>mounted.execute(command.id).catch(onError)});
  // Capture the rich editor bookmark BEFORE focus leaves; do not approximate DOM text offsets.
  bag.on(b,'pointerdown',()=>mounted.captureSelection?.());
  map.set(command.id,b);bar.append(b);
 }
 mounted.editor.before(bar);
 const roving=D.roving(bar);bag.add(()=>roving.dispose());
 function refresh(){
  if(dead)return;
  const context=adapter.getContext();const wanted=new Set(M.contextualItems(context.selection));
  label.textContent=M.selectionLabel(context.selection);
  for(const [id,b]of map){
   b.hidden=!wanted.has(id);const state=M.commandState(id,context);b.disabled=!state.enabled;
   b.title=state.reason||b.textContent;b.setAttribute('aria-description',state.reason||'');
   if(state.checked!==undefined)b.setAttribute('aria-pressed',String(state.checked));else b.removeAttribute('aria-pressed');
  }
  roving.sync();
 }
 const unsubscribe=adapter.subscribe(refresh);if(typeof unsubscribe!=='function')throw new Error('subscribe must return cleanup');bag.add(unsubscribe);
 refresh();
 return {element:bar,refresh,dispose(){if(dead)return;dead=true;bag.dispose();bar.remove();}};
}
root.ClioWorksContextStrip=Object.freeze({attachContextStrip});
})(globalThis);
