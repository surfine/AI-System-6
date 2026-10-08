// The browse origin's bootstrap. The server answers any navigation it sees
// with this page, which means the service worker is not running yet: the
// first page a writer opens, or one after the browser evicted the worker.
// It installs the worker and loads the same address again, which the worker
// then answers with the real page.
//
// If the worker cannot take over (a private window that disables service
// workers, a browser without them) the desk is told, and Time Machine shows
// its snapshot of the page instead.
(function () {
  "use strict";
  var note = document.getElementById("ais6-boot");
  function unavailable(reason) {
    if (note) note.textContent = "";
    try {
      // The desk checks event.origin; the message names no page and carries
      // nothing a third party could use, so it may go to any parent.
      window.parent.postMessage({ ais6: 1, type: "engine-unavailable", reason: String(reason || "") }, "*");
    } catch (error) {}
  }
  if (!("serviceWorker" in navigator)) {
    unavailable("no-service-worker");
    return;
  }
  var attemptsKey = "ais6-boot-attempts";
  var attempts = 0;
  try {
    attempts = Number(sessionStorage.getItem(attemptsKey) || 0);
    sessionStorage.setItem(attemptsKey, String(attempts + 1));
  } catch (error) {
    attempts = 0;
  }
  // A worker that installs but never controls the page would reload forever.
  if (attempts >= 3) {
    try {
      sessionStorage.removeItem(attemptsKey);
    } catch (error) {}
    unavailable("worker-did-not-take-control");
    return;
  }
  navigator.serviceWorker.register("/__ais6/sw.js", { scope: "/", updateViaCache: "none" })
    .then(function () {
      return navigator.serviceWorker.ready;
    })
    .then(function () {
      if (navigator.serviceWorker.controller) return null;
      return new Promise(function (resolve) {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
        setTimeout(resolve, 4000);
      });
    })
    .then(function () {
      location.reload();
    })
    .catch(function (error) {
      unavailable(error && error.name ? error.name : "register-failed");
    });
})();
