// The Micropolis engine bundle must stay UI-free. Some engine files import
// jQuery but only call it on legacy code paths (GameCanvas calls $ only when
// its parent is a selector string, never when it is a DOM element). This shim
// satisfies the import and turns any real call into a loud failure.
function jqueryForbidden() {
  throw new Error(
    "jQuery reached the Micropolis engine bundle. Pass DOM elements, not selectors; UI belongs to app/features/micropolis.js.",
  );
}

export default jqueryForbidden;
