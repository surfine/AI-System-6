/* Reusable shell components. All callbacks operate on caller-owned state.
 * Icons below are original command glyphs, NOT replacements for existing application icons. */
(function(root){
'use strict';
const D=root.ClioWorksDOM,C=root.ClioWorksCore,{h}=D;
const paths={
 new:'M3 2H10L13 5V14H3Z M10 2V5H13 M5 9H11 M8 6V12',
 open:'M2 5H6L8 3H14V13H2Z M2 7H14',
 save:'M3 2H12L14 4V14H2V2Z M5 2V6H11V2 M5 10H11V14H5Z',
 export:'M3 8V14H13V8 M8 11V2 M4 6L8 2L12 6',
 rename:'M3 12L4 9L11 2L14 5L7 12Z M2 14H14',
 close:'M4 4L12 12 M12 4L4 12',
 undo:'M6 3L2 7L6 11 M2 7H9Q14 7 13 13',
 redo:'M10 3L14 7L10 11 M14 7H7Q2 7 3 13',
 find:'M10 10L14 14 M11 7A4 4 0 1 1 3 7A4 4 0 1 1 11 7',
 insert:'M2 2H14V14H2Z M4 8H12 M8 4V12',
 comment:'M2 3H14V11H7L3 14V11H2Z M5 6H11 M5 8H9',
 format:'M2 4H14 M2 8H14 M2 12H14 M5 2V6 M11 6V10 M7 10V14',
 outline:'M2 2H14V14H2Z M6 2V14 M8 5H12 M8 8H12 M8 11H12',
 focus:'M2 6V2H6 M10 2H14V6 M14 10V14H10 M6 14H2V10',
 page:'M4 2H12V14H4Z M6 5H10 M6 8H10 M6 11H9',
 ask:'M5 6C5 2 12 2 12 6C12 9 8 8 8 11 M8 13V14',
 source:'M6 4H2V14H12V10 M7 2H14V9 M14 2L6 10',
 play:'M4 2L14 8L4 14Z',
 copy:'M5 2H14V11H11 M2 5H11V14H2Z',
 delete:'M2 4H14 M5 4V2H11V4 M4 4V14H12V4 M7 6V12 M9 6V12',
 up:'M3 10L8 5L13 10',down:'M3 6L8 11L13 6',
 rotate:'M12 5H15V2 M15 5C11 -1 2 2 2 8C2 14 10 16 13 11',
 more:'M3 7H4V8H3Z M7 7H8V8H7Z M11 7H12V8H11Z',
 chart:'M2 2V14H14 M5 12V8H7V12 M9 12V4H11V12',
 check:'M2 8L6 12L14 3',link:'M7 4L9 2Q12 0 14 3Q16 5 13 8L11 10 M9 12L7 14Q4 16 2 13Q0 11 3 8L5 6 M5 11L11 5',
 grid:'M2 2H14V14H2Z M2 6H14 M2 10H14 M6 2V14 M10 2V14',
 info:'M8 7V12 M8 4V5 M14 8A6 6 0 1 1 2 8A6 6 0 1 1 14 8'
};
function icon(name){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('width','16');svg.setAttribute('height','16');svg.setAttribute('aria-hidden','true');svg.classList.add('cw-icon');
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.info);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.25');path.setAttribute('stroke-linecap','square');path.setAttribute('stroke-linejoin','miter');svg.append(path);return svg;
}
function button({label,icon:which,onClick,primary=false,disabled=false,title='',className='',attrs={}}){
 const el=h('button',{type:'button',class:`btn cw-button ${primary?'default':''} ${className}`,disabled,title,...attrs},[which?icon(which):null,h('span',{class:'cw-button-label',text:label})]);
 if(onClick)el.addEventListener('click',onClick);return el;
}
function createToolbar({items,onCommand,getContext,label='文档工具'}){
 const element=h('div',{class:'cw-toolbar',role:'toolbar','aria-label':label});const buttons=new Map();
 for(const item of items){
  if(item==='separator'){element.append(h('span',{class:'cw-tool-divider',role:'separator','aria-orientation':'vertical'}));continue;}
  const c=C.COMMANDS.find(x=>x.id===item.id);if(!c)throw new Error(`Unknown toolbar command ${item.id}`);
  const b=button({label:item.label||c.label,icon:c.icon,className:`cw-tool ${item.optional?'cw-optional':''}`,attrs:{dataset:{command:c.id},'aria-label':item.label||c.label},onClick:()=>onCommand(c.id,b)});
  buttons.set(c.id,b);element.append(b);
 }
 const more=button({label:'更多',icon:'more',className:'cw-tool cw-more',attrs:{'aria-haspopup':'menu'},onClick:()=>onCommand('menu.more',more)});element.append(more);
 const nav=D.roving(element);
 function refresh(){const ctx=getContext();for(const [id,b]of buttons){const s=C.commandState(id,ctx);b.disabled=!s.enabled;b.title=s.reason||C.COMMANDS.find(c=>c.id===id).label;if(s.reason)b.setAttribute('aria-description',s.reason);else b.removeAttribute('aria-description');}nav.sync();}
 refresh();return {element,refresh,dispose:()=>nav.dispose(),buttons};
}
class PopupMenu{
 constructor(owner){this.owner=owner;this.current=null;}
 close({restore=true}={}){if(!this.current)return;const {el,bag,anchor}=this.current;this.current=null;bag.dispose();el.remove();anchor?.setAttribute('aria-expanded','false');if(restore&&anchor?.isConnected)anchor.focus({preventScroll:true});}
 open({anchor,items,onCommand,label='菜单'}){
  this.close({restore:false});const el=h('div',{class:'cw-root cw-menu',role:'menu','aria-label':label}),bag=D.disposable();
  for(const item of items){
   if(item.separator){el.append(h('div',{class:'cw-menu-rule',role:'separator'}));continue;}
   const b=h('button',{type:'button',role:item.checked!==undefined?'menuitemcheckbox':'menuitem',class:'cw-menu-item',tabIndex:-1,'aria-disabled':item.enabled===false?'true':'false',title:item.reason||'',dataset:{menuCommand:item.id}},[
    h('span',{class:'cw-menu-check',text:item.checked?'✓':''}),h('span',{text:item.label}),h('kbd',{text:item.shortcut||''})]);
   if(item.checked!==undefined)b.setAttribute('aria-checked',String(item.checked));
   bag.on(b,'click',()=>{if(item.enabled===false)return;this.close({restore:false});onCommand(item.id,anchor);});el.append(b);
  }
  this.owner.append(el);anchor.setAttribute('aria-expanded','true');
  const rect=anchor.getBoundingClientRect();
  const position=()=>{el.style.left=`${C.clamp(rect.left,8,Math.max(8,innerWidth-el.offsetWidth-8))}px`;el.style.top=`${C.clamp(rect.bottom+3,8,Math.max(8,innerHeight-el.offsetHeight-8))}px`;};position();
  const buttons=[...el.querySelectorAll('[role^="menuitem"]')];buttons[0]?.focus();
  bag.on(el,'keydown',e=>{
   const index=buttons.indexOf(document.activeElement);let next;
   if(e.key==='ArrowDown')next=(index+1)%buttons.length;if(e.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;
   if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;
   if(next!==undefined){e.preventDefault();buttons[next].focus();}
   if(e.key==='Escape'){e.preventDefault();this.close();}
   if(e.key==='Tab')this.close();
  });
  bag.on(document,'pointerdown',e=>{if(!el.contains(e.target)&&!anchor.contains(e.target))this.close({restore:false});},true);
  bag.on(window,'resize',()=>this.close());
  this.current={el,bag,anchor};return el;
 }
 dispose(){this.close({restore:false});}
}
function field(label,value,options={}){
 const control=options.choices?h('select',{'aria-label':label},options.choices.map(x=>h('option',{value:typeof x==='string'?x:x.value,text:typeof x==='string'?x:x.label}))):(options.multiline?h('textarea',{'aria-label':label}):h('input',{type:options.type||'text','aria-label':label}));
 control.value=value??'';if(options.disabled)control.disabled=true;if(options.min!==undefined)control.min=options.min;if(options.max!==undefined)control.max=options.max;
 if(options.onChange)control.addEventListener('change',()=>options.onChange(control.value));
 const element=h('label',{class:'cw-field'},[h('span',{class:'cw-field-label',text:label}),control,options.help?h('small',{class:'cw-help',text:options.help}):null]);
 return {element,control};
}
function propertyGroup(title,children){return h('fieldset',{class:'cw-property-group'},[h('legend',{text:title}),...children]);}
function statusText(context){
 if(context.closed)return '未打开文件';if(context.readonly)return '只读 · 可以选择和复制内容';
 if(context.status==='saving')return '正在保存当前快照…';if(context.status==='failed')return '保存失败 · 修改仍在窗口中';
 if(context.status==='dirty')return '有未保存的修改';return context.savedLabel||'已保存';
}
root.ClioWorksComponents=Object.freeze({icon,button,createToolbar,PopupMenu,field,propertyGroup,statusText});
})(globalThis);
