// Clear Browsing Data, run on the browse origin. The desk opens this page in
// a hidden frame; the service worker that controls it empties every sealed
// cookie jar and every page's storage, then the desk is told.
(function () {
  "use strict";
  var desk = new URLSearchParams(location.search).get("d") || "";
  function done(ok) {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {}
    if (desk) window.parent.postMessage({ ais6: 1, type: "cleared", ok: !!ok }, desk);
  }
  var controller = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!controller) {
    done(true);
    return;
  }
  var channel = new MessageChannel();
  channel.port1.onmessage = function () {
    done(true);
  };
  controller.postMessage({ ais6: 1, type: "clear" }, [channel.port2]);
  setTimeout(function () {
    done(false);
  }, 6000);
})();
