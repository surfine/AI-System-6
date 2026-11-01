// Shared IME safety guard. Chinese/Japanese/Korean composition in flight must
// never trigger Enter-submit, Escape-cancel, or shortcut dispatch. The primary
// signal is event.isComposing; keyCode 229 is the legacy WebKit fallback.

function eventIsTextComposition(event) {
  return !!(event && (event.isComposing === true || event.keyCode === 229));
}

// A control whose visible text lives in another node — a highlight overlay
// under a transparent textarea, a button that mirrors a hidden select — loses
// that mirror the moment code writes the value, because a programmatic write
// fires no input or change event. Wrapping the instance property over the
// prototype descriptor keeps every writer honest at once, so no call site has
// to remember a refresh.
function watchControlWrites(element, prototype, property, onWrite) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  if (!descriptor?.set) return;
  Object.defineProperty(element, property, {
    configurable: true,
    get() { return descriptor.get.call(this); },
    set(next) {
      descriptor.set.call(this, next);
      onWrite(this);
    },
  });
}

window.AISystem6InputGuard = Object.freeze({
  isComposition: eventIsTextComposition,
});
