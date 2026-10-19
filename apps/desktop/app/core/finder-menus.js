// Classic-era Finder menus (lazy): the System 6.0.8 Finder rows (owner
// decision 10), with Get Privileges left out (no AppleShare) and the product's
// own commands in a trailing group. menus.js asks for this module the first
// time a classic era draws the Finder's menu bar and keeps finderMenus until it
// is in. It reads the shared menu helpers and rows from menus.js.
(function () {
  const rows = (menuIndex, ...actions) => actions.map((action) => (
    action === "-" ? menuSeparator : finderMenus[menuIndex].items.find((row) => row.action === action)
  ));
  // Print Directory… and Erase Disk… carry the System 6 ellipsis; the modern
  // Finder rows keep their own labels.
  const relabel = (labelKeys) => (row) => (labelKeys[row.action] ? { ...row, labelKey: labelKeys[row.action] } : row);
  const finderClassicMenus = [
    menu("file", "menu_file", [
      menuItem("new-folder", "new_folder", "new-folder-classic"),
      ...rows(0, "open-menu-selection"),
      // Print prints the open document, so the Finder dims it.
      menuItem("print-current", "print_item"),
      ...rows(0, "close-active-window", "-", "open-file-info", "duplicate-selection", "put-away", "-", "page-setup", "print-directory", "-",
        "eject-menu-selection", "-", "make-alias", "rename-file", "attach-selected-to-cliotalk", "move-file-trash", "insert-text-disk",
        "open-demo-disks", "open-project-overview").map(relabel({ "print-directory": "print_directory_classic" })),
    ]),
    menu("edit", "menu_edit", [
      ...editBasics.map(relabel({ "clear-edit": "edit_clear" })),
      menuSeparator,
      menuItem("show-clipboard", "show_clipboard"),
    ]),
    finderMenus[2],
    finderMenus[3],
    menu("special", "menu_special", [
      menuItem("finder-clean-up", "clean_up_desktop"),
      ...rows(5, "empty-trash", "erase-disk", "set-startup-project").map(relabel({ "erase-disk": "erase_disk_classic" })),
      menuSeparator,
      ...systemSpecialItems.slice(-2),
      menuSeparator,
      ...rows(5, "open-theme-lab", "window-browse", "windowshade-arrange-menu"),
      ...systemSpecialItems.slice(0, -3),
    ]),
  ];
  lazyApplicationMenuSets.set("finderClassic", finderClassicMenus);
  window.AISystem6FinderMenusLoaded = true;
})();
