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
    },
    /** Every Tendril key on this device, without the prefix. */
    keys: function () {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
        }
      } catch (e) { /* storage unavailable */ }
      return out.sort();
    },
    available: function () {
      try {
        localStorage.setItem(PREFIX + "__test", "1");
        localStorage.removeItem(PREFIX + "__test");
        return true;
      } catch (e) { return false; }
    }
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Offer a generated file to the user as a download. */
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /** "today", "tomorrow", "in 3 days", "2 days ago" */
  function relDays(date) {
    const start = function (d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const diff = Math.round((start(date) - start(new Date())) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff === -1) return "yesterday";
    return diff > 0 ? "in " + diff + " days" : (-diff) + " days ago";
  }

  function fmtDate(d, withTime) {
    const date = new Date(d);
    const opts = { weekday: "short", day: "numeric", month: "short" };
    let s = date.toLocaleDateString(undefined, opts);
    if (withTime) s += ", " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return s;
  }

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

  let toastTimer = 0;
  function toast(msg) {
    let el = document.getElementById("tendril-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "tendril-toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ---------------- App install + offline ----------------
  const isStandalone = function () {
    return (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) || global.navigator.standalone === true;
  };
  let installPrompt = null;
  global.addEventListener("beforeinstallprompt", function (ev) {
    ev.preventDefault();
    installPrompt = ev;
    document.dispatchEvent(new CustomEvent("tendril:installable"));
  });
  global.addEventListener("appinstalled", function () {
    installPrompt = null;
    document.dispatchEvent(new CustomEvent("tendril:installed"));
  });
  function promptInstall() {
    if (!installPrompt) return Promise.resolve(false);
    const p = installPrompt;
    installPrompt = null;
    p.prompt();
    return p.userChoice.then(function (c) { return c && c.outcome === "accepted"; });
  }

  function showUpdateBar(worker) {
    if (document.getElementById("tendril-update")) return;
    const bar = document.createElement("div");
    bar.id = "tendril-update";
    bar.className = "toast update-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<span>A new version of Tendril is ready.</span> <button type="button" class="btn btn-primary btn-small">Update</button>';
    bar.querySelector("button").addEventListener("click", function () { worker.postMessage("skip-waiting"); });
    document.body.appendChild(bar);
  }

  if ("serviceWorker" in navigator && /^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href)) {
    global.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
        reg.addEventListener("updatefound", function () {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", function () {
            if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(w);
          });
        });
      }).catch(function () { /* offline support unavailable; the site still works */ });
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (reloaded) return;
        reloaded = true;
        global.location.reload();
      });
    });
  }

  // ---------------- Larger files (voice recordings) ----------------
  // localStorage is too small for audio, so recordings live in IndexedDB,
  // still only on this device. Keys are voice session ids.
  const blobs = (function () {
    let dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        if (!global.indexedDB) { reject(new Error("no-idb")); return; }
        const req = indexedDB.open("tendril", 1);
        req.onupgradeneeded = function () { req.result.createObjectStore("recordings"); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      dbp.catch(function () { dbp = null; });
      return dbp;
    }
    function run(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          const tx = d.transaction("recordings", mode);
          const req = fn(tx.objectStore("recordings"));
          tx.oncomplete = function () { resolve(req ? req.result : undefined); };
          tx.onerror = tx.onabort = function () { reject(tx.error); };
        });
      });
    }
    return {
      put: function (id, blob) { return run("readwrite", function (s) { return s.put(blob, id); }); },
      get: function (id) { return run("readonly", function (s) { return s.get(id); }); },
      del: function (id) { return run("readwrite", function (s) { return s.delete(id); }); },
      clear: function () { return run("readwrite", function (s) { return s.clear(); }); },
      count: function () { return run("readonly", function (s) { return s.count(); }); },
      totalBytes: function () {
        return run("readonly", function (s) { return s.getAll(); }).then(function (all) {
          return (all || []).reduce(function (n, b) { return n + (b && b.size ? b.size : 0); }, 0);
        });
      }
    };
  })();

  global.Tendril = {
    blobs: blobs,
    isStandalone: isStandalone, promptInstall: promptInstall,
    canPromptInstall: function () { return !!installPrompt; },
    store: store, quickExit: quickExit, uid: uid, download: download, toast: toast,
    relDays: relDays, fmtDate: fmtDate
  };
})(window);
