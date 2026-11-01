/* ClioWorks contextual interface contract. No editor model, network or persistence. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClioWorksUIModel = api;
})(globalThis, function () {
  'use strict';
  const freeze = x => Object.freeze(x);
  const err = (code, message) => Object.assign(new Error(message || code), {code});
  const TYPES = freeze(['none','text','table','chart','image','shape','group','page','mixed','opaque']);
  const PANELS = freeze(['none','format','source','review','checks','production']);
  const CATALOG = freeze([
    ['file.save','保存','save','file',false], ['file.export','导出…','export','file',false],
    ['view.outline','导航','outline','view',false], ['object.insert','插入…','insert','insert',true],
    ['format.open','格式','format','format',false], ['comment.open','批注','comment','tools',false],
    ['ask.open','问一问','ask','tools',false], ['stage.present','放映','play','tools',false],
    ['edit.undo','撤销','undo','edit',true], ['edit.redo','重做','redo','edit',true],
    ['embed.edit','编辑副本','grid','format',false], ['source.inspect','查看来源','source','tools',false],
    ['source.open','检查来源更新…','source','tools',false],
    ['object.arrange','排列…','format','format',false], ['text.bold','粗体','format','format',true],
    ['table.format','单元格格式…','grid','format',false], ['chart.kind','图表类型…','chart','format',false],
    ['image.crop','裁剪…','format','format',true], ['layout.check','检查当前页','check','tools',false]
  ].map(([id,label,icon,group,modifies]) => freeze({id,label,icon,group,modifies})));
  const byId = new Map(CATALOG.map(c => [c.id,c]));
  function validateContext(raw) {
    if (!raw || !['write','chart','stage','pdf'].includes(raw.kind)) throw err('INVALID_CONTEXT');
    for (const k of ['documentId','sessionId']) if (typeof raw[k] !== 'string' || !raw[k]) throw err('INVALID_ID',k);
    for (const k of ['generation','editRevision','selectionEpoch'])
      if (!Number.isSafeInteger(raw[k]) || raw[k] < 0) throw err('INVALID_REVISION',k);
    if (!Array.isArray(raw.supported) || !raw.supported.every(s => typeof s === 'string')) throw err('INVALID_CAPABILITIES');
    const selection = raw.selection || {kind:'none', ids:[]};
    if (!TYPES.includes(selection.kind) || !Array.isArray(selection.ids) ||
        !selection.ids.every(x => typeof x === 'string' && x) || new Set(selection.ids).size !== selection.ids.length)
      throw err('INVALID_SELECTION');
    for (const key of ['readonly','composing','saving','closed','active','writeAllowed'])
      if (typeof raw[key] !== 'boolean') throw err('INVALID_FLAG',key);
    return {...raw,selection};
  }
  function commandState(id, raw) {
    const c=byId.get(id); if (!c) return {enabled:false,reason:'未登记的操作',code:'UNKNOWN_COMMAND'};
    let x; try{x=validateContext(raw);}catch {return {enabled:false,reason:'编辑上下文尚未就绪',code:'INVALID_CONTEXT'};}
    const no=(code,reason)=>({enabled:false,reason,code});
    if (x.closed) return no('CLOSED','文件已关闭');
    if (!x.active) return no('INACTIVE','请先回到这个文档窗口');
    if (!x.supported.includes(id)) return no('NOT_CONNECTED','当前编辑器尚未接通此操作');
    if (x.composing) return no('COMPOSING','请先完成当前输入');
    if (x.modalOpen) return no('MODAL_OPEN','请先完成当前对话框');
    if (x.frameState && x.frameState !== 'idle') {
      const allowed=['format.open','source.inspect'];
      if (!allowed.includes(id)) return no('FRAME_ACTIVE','请先采用或取消正在编辑的副本');
    }
    if ((c.modifies || id==='file.save' || id==='embed.edit') && (x.readonly || !x.writeAllowed))
      return no('READONLY','当前文件只读；可以导出副本或查看来源');
    if (id==='file.save' && x.saving) return no('SAVE_BUSY','保存正在进行');
    if (id==='edit.undo'&&!x.canUndo) return no('NO_UNDO','没有可撤销的修改');
    if (id==='edit.redo'&&!x.canRedo) return no('NO_REDO','没有可重做的修改');
    const s=x.selection;
    if (id==='embed.edit' && !(s.ids.length===1 && s.embedded===true && s.editable===true && s.locked!==true))
      return no('NO_EDITABLE_EMBED','先选择一个可编辑副本；只保留的对象不能编辑内部内容');
    if ((id==='source.inspect'||id==='source.open') && !s.hasSource) return no('NO_SOURCE','这个对象没有来源记录');
    if (id==='source.open' && s.sourceAccessible!==true) return no('SOURCE_UNAVAILABLE','来源不可访问；当前副本仍可使用');
    if (id==='text.bold' && s.kind!=='text') return no('NOT_TEXT','请先选择文字');
    if (id==='table.format' && s.kind!=='table') return no('NOT_TABLE','请先选择单元格');
    if (id==='chart.kind' && s.kind!=='chart') return no('NOT_CHART','请先选择图表');
    if (id==='image.crop' && (s.kind!=='image'||s.locked)) return no('NOT_IMAGE','请先选择可编辑图片');
    if (id==='object.arrange' && !['table','chart','image','shape','group','mixed','opaque'].includes(s.kind))
      return no('NOT_OBJECT','请先选择对象');
    if (['stage.present','layout.check'].includes(id) && x.kind!=='stage') return no('NOT_STAGE','此命令属于讲演台');
    return {enabled:true,reason:'',code:'READY', checked:id==='text.bold'?(s.bold==='mixed'?'mixed':s.bold===true):undefined};
  }
  function contextualItems(selection) {
    const k=selection?.kind||'none';
    const map={none:['object.insert'],text:['text.bold','format.open','comment.open'],
      table:['table.format','format.open','object.arrange'],chart:['embed.edit','chart.kind','source.inspect'],
      image:['image.crop','object.arrange','source.inspect'],shape:['format.open','object.arrange'],
      group:['object.arrange','format.open'],page:['object.insert','layout.check'],mixed:['object.arrange'],
      opaque:['object.arrange','source.inspect']};
    const list=(map[k]||map.none).slice();
    if(selection?.embedded && selection.editable && !list.includes('embed.edit'))list.unshift('embed.edit');
    return list;
  }
  function selectionLabel(s) {
    if(!s||s.kind==='none')return '文档';
    if(s.kind==='mixed')return `已选 ${s.ids.length} 个对象 · 只显示共同操作`;
    const names={text:'文字',table:'表格',chart:'图表',image:'图片',shape:'形状',group:'组合',page:'页面',opaque:'仅保留对象'};
    return `${names[s.kind]||'对象'}${s.label?' · '+s.label:''}${s.embedded?' · 当前文档内的副本':''}`;
  }
  function layoutFor({width,height=700,panel='none',navigation=false,coarse=false}) {
    if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)throw err('INVALID_SIZE');
    if(!PANELS.includes(panel))throw err('INVALID_PANEL');
    const open=panel!=='none';
    // Use the same topology across themes; geometry is controlled by available content area.
    const placement=!open?'hidden':width<640?'replace':width<1040?'below':'docked';
    return freeze({placement, panelWidth:placement==='docked'?264:0,
      showNavigation:navigation && width>=900 && !(placement==='docked'&&width<1240),
      contextOverflow:width<640, hitTarget:coarse?44:24,
      decisionInOwnRow:true, condensedHeight:height<540, editorVisible:placement!=='replace'});
  }
  function createViewState() {
    let panel='none', previous='none';
    return {get:()=>({panel,previous}),open(next){if(!PANELS.includes(next))throw err('INVALID_PANEL');previous=panel;panel=next;return this.get();},close(){panel='none';return this.get();}};
  }
  function sameTarget(a,b) {
    return !!a&&!!b&&['documentId','sessionId','generation','editRevision'].every(k=>a[k]!==undefined&&a[k]===b[k]);
  }
  return freeze({CATALOG,TYPES,PANELS,validateContext,commandState,contextualItems,selectionLabel,layoutFor,createViewState,sameTarget});
});
