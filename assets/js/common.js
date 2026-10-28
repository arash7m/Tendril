/* Tendril shared helpers: safe local storage and the quick-exit button. */
(function (global) {
  "use strict";

  const PREFIX = "tendril:";

  const store = {
    get: function (key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove: function (key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    }
  };

  // Quick exit: leave for a neutral page and replace this one in history,
  // so the Back button doesn't return here. Pressing Escape twice also works.
  const EXIT_URL = "https://www.google.com/search?q=weather+today";

  function quickExit() {
    try { global.location.replace(EXIT_URL); }
    catch (e) { global.open(EXIT_URL, "_blank"); }
  }

  function wireQuickExit() {
    document.querySelectorAll("[data-quick-exit]").forEach(function (el) {
      el.addEventListener("click", function (ev) { ev.preventDefault(); quickExit(); });
    });
    let lastEsc = 0;
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      const now = Date.now();
      if (now - lastEsc < 600) quickExit();
      lastEsc = now;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireQuickExit);
  else wireQuickExit();

  global.Tendril = { store: store, quickExit: quickExit };
})(window);
