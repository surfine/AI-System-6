/* Shared host-material 更多 menu for ClioWorks adapters (port v3.1 extraction).
 * Builds on the host's shared .menu-popover surface — era-owned material, the
 * z-system-menu-popover layer token, and item/disabled styling all come from the
 * host; only scroll geometry is ours (92-clioworks-native.css). The kit's own
 * .cw-menu styles live in the forbidden workspace.css and are never loaded. */
(function (root) {
  'use strict';

  function createMoreMenu(hostWindow) {
    const doc = hostWindow.document;
    let open = null;

    function remove() {
      open?.remove();
      open = null;
    }

    /* ({ anchor, context, execute }) per the HostMenuPort contract. */
    function openMore({ anchor, context, execute }) {
      const C = root.ClioWorksCore;
      remove();
      const menu = doc.createElement('div');
      open = menu;
      menu.className = 'menu-popover cw3-more-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'ClioWorks 更多命令');
      for (const command of C.COMMANDS) {
        const state = C.commandState(command.id, context);
        const item = doc.createElement('button');
        item.type = 'button';
        item.disabled = !state.enabled;
        item.title = state.reason || '';
        item.textContent = command.label;
        item.addEventListener('click', () => { remove(); execute(command.id); });
        menu.append(item);
      }
      doc.body.append(menu);
      menu.style.display = 'block';
      menu.style.position = 'fixed';
      const rect = anchor.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(rect.left, hostWindow.innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = Math.min(rect.bottom + 4, hostWindow.innerHeight - menu.offsetHeight - 8) + 'px';
      const close = (event) => {
        if (!menu.contains(event.target) && event.target !== anchor) {
          remove();
          doc.removeEventListener('pointerdown', close, true);
        }
      };
      doc.addEventListener('pointerdown', close, true);
      anchor.focus?.({ preventScroll: true });
    }

    return Object.freeze({ openMore, remove });
  }

  root.ClioWorksMoreMenu = Object.freeze({ create: createMoreMenu });
})(typeof window !== 'undefined' ? window : globalThis);
