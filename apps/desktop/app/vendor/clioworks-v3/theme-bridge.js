/* Actual AI System 6 API inspected at 968733e40434. No era recipes in this module.
 * Host mount inherits tokens and host components directly. The observer waits for the
 * real registry's whenReady() before publishing metadata. It NEVER calls applyTheme(). */
(function(root) {
  'use strict';
  const TOKENS=Object.freeze([
    '--ui-font','--title-font','--system-control-size','--system-control-min-height',
    '--system-button-min-height','--ink','--paper','--window-bg','--window-border','--window-radius',
    '--toolbar-bg','--toolbar-border','--sidebar-bg','--selection-bg','--selection-fg',
    '--system-disabled-fg','--system-primary-divider','--system-secondary-divider',
    '--field-bg','--field-border','--field-radius','--field-focus-ring','--btn-bg','--btn-fg',
    '--btn-border','--btn-radius','--btn-shadow','--system-focus-outline'
  ]);
  function readTokens(element) {
    const css=element.ownerDocument.defaultView.getComputedStyle(element), values={};
    for (const name of TOKENS) values[name]=css.getPropertyValue(name).trim();
    return values;
  }
  function attachNativeTheme({element, hostWindow=root, onChange=()=>{}, onError=()=>{}}) {
    const registry=hostWindow.AISystem6Theme;
    if (!registry?.getTheme || !registry?.whenReady) throw new Error('AISystem6Theme 未就绪，请先加载主仓 theme-registry.js。');
    let generation=0, disposed=false;
    const document=hostWindow.document;
    async function refresh() {
      const mine=++generation;
      try { await registry.whenReady(); } catch(error) {
        if(!disposed && mine===generation) {element.dataset.cwThemeReady="failed";onError(error);}
        return;
      }
      if (disposed || mine!==generation || !element.isConnected) return;
      const theme=registry.getTheme();
      // Metadata is scoped to this workspace. Body, document style and editor model stay untouched.
      element.dataset.cwFamily=theme.family;
      element.dataset.cwMenuModel=registry.getMenuBarModel();
      const tokens=readTokens(element);
      const missing=['--ink','--toolbar-bg','--field-bg','--ui-font'].filter(k=>!tokens[k]);
      element.dataset.cwThemeReady=missing.length?'incomplete':'true';
      onChange({themeId:theme.id, family:theme.family, tokens, missing, epoch:mine});
    }
    const events=['ai-system6-themechange','ai-system6-appearancestylesready','ai-system6-colormodechange'];
    for (const event of events) document.addEventListener(event,refresh);
    const ready=refresh();
    return {ready,refresh,dispose(){disposed=true;generation++;for(const event of events)document.removeEventListener(event,refresh);}};
  }
  root.ClioWorksThemeBridge=Object.freeze({TOKENS,readTokens,attachNativeTheme});
})(globalThis);
