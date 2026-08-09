// Shared IME safety guard. Chinese/Japanese/Korean composition in flight must
// never trigger Enter-submit, Escape-cancel, or shortcut dispatch. The primary
// signal is event.isComposing; keyCode 229 is the legacy WebKit fallback.

function eventIsTextComposition(event) {
  return !!(event && (event.isComposing === true || event.keyCode === 229));
}

window.AISystem6InputGuard = Object.freeze({
  isComposition: eventIsTextComposition,
});
