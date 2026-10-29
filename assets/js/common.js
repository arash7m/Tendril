/* Tendril shared helpers: storage (optionally encrypted behind an app lock),
   recordings, quick exit, toasts, install/offline support. */
(function (global) {
  "use strict";

  const PREFIX = "tendril:";
  const LOCK_KEY = PREFIX + "__lock";     // lock settings (salt, timing, PIN length)
  const VAULT_KEY = PREFIX + "__vault";   // all app data, encrypted, while the lock is on
  const TRIES_KEY = PREFIX + "__tries";   // wrong-PIN counter for the retry delay
  const SESSION_KEY = "tendril:session";  // sessionStorage: unlocked key for this app session
  const ITERATIONS = 600000;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ---------------- Small helpers ----------------
  function b64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function isInternal(k) { return k.indexOf("__") === 0; }

  // ---------------- Encryption ----------------
  async function deriveKey(pin, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" }, base, 256);
    return importRaw(new Uint8Array(bits));
  }
  function importRaw(raw) {
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }
  async function encryptBytes(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes);
    return { iv: iv, ct: new Uint8Array(ct) };
  }
  async function decryptBytes(key, iv, ct) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct));
  }
  async function sealJSON(key, obj) {
    const r = await encryptBytes(key, enc.encode(JSON.stringify(obj)));
    return JSON.stringify({ iv: b64(r.iv), ct: b64(r.ct) });
  }
  async function openJSON(key, text) {
    const o = JSON.parse(text);
    return JSON.parse(dec.decode(await decryptBytes(key, unb64(o.iv), unb64(o.ct))));
  }

  // ---------------- Storage ----------------
  // Without the lock, each value is a plain localStorage entry.
  // With the lock, everything lives in memory after unlocking and is saved
  // as one encrypted entry; nothing readable is left in storage.
  let vault = null;     // object of key -> value while unlocked
  let vaultKey = null;  // CryptoKey while unlocked
  let writing = Promise.resolve();

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  function persistVault() {
    const snapshot = JSON.parse(JSON.stringify(vault));
    const key = vaultKey;
    writing = writing.then(function () {
      return sealJSON(key, snapshot).then(function (text) {
        if (!lsSet(VAULT_KEY, text)) toast("Your phone is out of space for Tendril. Delete some recordings or old sessions.");
      });
    }).catch(function () { /* keep the queue alive */ });
    return writing;
  }

  const store = {
    get: function (key, fallback) {
      if (vault) return key in vault ? clone(vault[key]) : fallback;
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      if (vault) { vault[key] = clone(value); persistVault(); return true; }
      return lsSet(PREFIX + key, JSON.stringify(value));
    },
    remove: function (key) {
      if (vault) { delete vault[key]; persistVault(); return; }
      lsDel(PREFIX + key);
    },
    /** Every Tendril data key on this device, without the prefix. */
    keys: function () {
      if (vault) return Object.keys(vault).sort();
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0 && !isInternal(k.slice(PREFIX.length))) out.push(k.slice(PREFIX.length));
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
    },
    /** Resolves once pending encrypted writes are on disk. */
    flush: function () { return writing; }
  };

  // ---------------- Larger files (recordings, photos) ----------------
  // Kept in IndexedDB on this device. With the lock on they're encrypted
  // with the same key as everything else.
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error("no-idb")); return; }
      const req = indexedDB.open("tendril", 2);
      req.onupgradeneeded = function () {
        const d = req.result;
        ["recordings", "photos"].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error("blocked")); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }

  function makeBlobStore(name) {
    function run(mode, fn) {
      return idb().then(function (d) {
        return new Promise(function (resolve, reject) {
          const tx = d.transaction(name, mode);
          const req = fn(tx.objectStore(name));
          tx.oncomplete = function () { resolve(req ? req.result : undefined); };
          tx.onerror = tx.onabort = function () { reject(tx.error); };
        });
      });
    }
    async function seal(blob, key) {
      if (!key) return blob;
      const r = await encryptBytes(key, new Uint8Array(await blob.arrayBuffer()));
      return { sealed: 1, type: blob.type, iv: r.iv, data: r.ct };
    }
    async function unseal(value, key) {
      if (!value || !value.sealed) return value;
      if (!key) throw new Error("locked");
      return new Blob([await decryptBytes(key, value.iv, value.data)], { type: value.type });
    }
    function size(v) { return v ? (v.sealed ? v.data.byteLength : v.size || 0) : 0; }
    const api = {
      put: async function (id, blob) {
        const v = await seal(blob, vaultKey);
        return run("readwrite", function (s) { return s.put(v, id); });
      },
      get: async function (id) {
        const v = await run("readonly", function (s) { return s.get(id); });
        return unseal(v, vaultKey);
      },
      del: function (id) { return run("readwrite", function (s) { return s.delete(id); }); },
      clear: function () { return run("readwrite", function (s) { return s.clear(); }); },
      keys: function () { return run("readonly", function (s) { return s.getAllKeys(); }); },
      count: function () { return run("readonly", function (s) { return s.count(); }); },
      totalBytes: function () {
        return run("readonly", function (s) { return s.getAll(); }).then(function (all) {
          return (all || []).reduce(function (n, v) { return n + size(v); }, 0);
        });
      },
      /** Re-encrypt everything: fromKey/toKey may be null for "not encrypted". */
      rekey: async function (fromKey, toKey) {
        const keys = await api.keys().catch(function () { return []; });
        for (const id of keys || []) {
          const v = await run("readonly", function (s) { return s.get(id); });
          const plain = await unseal(v, fromKey);
          const next = await seal(plain, toKey);
          await run("readwrite", function (s) { return s.put(next, id); });
        }
      }
    };
    return api;
  }

  const blobs = makeBlobStore("recordings");
  const photos = makeBlobStore("photos");
  const media = {
    rekey: async function (from, to) { await blobs.rekey(from, to); await photos.rekey(from, to); },
    clear: function () {
      return Promise.all([blobs.clear(), photos.clear()]).catch(function () { /* nothing stored */ });
    }
  };

  /** Ask the browser not to clear Tendril's storage when space runs low. */
  function keepStorage() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  }

  // ---------------- App lock ----------------
  function lockMeta() {
    const raw = lsGet(LOCK_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function saveMeta(m) { lsSet(LOCK_KEY, JSON.stringify(m)); }

  async function rememberSession(key) {
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    ssSet(SESSION_KEY, JSON.stringify({ k: b64(raw), hiddenAt: null }));
  }
  function forgetSession() { ssDel(SESSION_KEY); }

  /** True when the app was left long enough ago that it should lock. */
  function sessionExpired(meta) {
    const s = ssGet(SESSION_KEY);
    if (!s) return true;
    try {
      const o = JSON.parse(s);
      return !!(o.hiddenAt && Date.now() - o.hiddenAt > meta.grace * 1000);
    } catch (e) { return true; }
  }
  function markHidden() {
    const s = ssGet(SESSION_KEY);
    if (!s) return;
    // Keep the earliest time: a reload or page change while away mustn't reset the timer.
    try { const o = JSON.parse(s); if (!o.hiddenAt) { o.hiddenAt = Date.now(); ssSet(SESSION_KEY, JSON.stringify(o)); } } catch (e) { /* ignore */ }
  }
  function markVisible() {
    const s = ssGet(SESSION_KEY);
    if (!s) return;
    try { const o = JSON.parse(s); o.hiddenAt = null; ssSet(SESSION_KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
  }

  async function openVault(key) {
    const text = lsGet(VAULT_KEY);
    vault = text ? await openJSON(key, text) : {};
    vaultKey = key;
  }

  const lock = {
    enabled: function () { return !!lockMeta(); },
    settings: function () { const m = lockMeta(); return m ? { grace: m.grace, length: m.length } : null; },

    /** Turn the lock on: encrypt everything with a key made from the PIN. */
    enable: async function (pin, grace) {
      if (lock.enabled()) throw new Error("already-on");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(pin, salt);
      const data = {};
      store.keys().forEach(function (k) { data[k] = store.get(k, null); });
      await media.rekey(null, key);
      lsSet(VAULT_KEY, await sealJSON(key, data));
      saveMeta({ v: 1, salt: b64(salt), iterations: ITERATIONS, grace: grace, length: pin.length });
      Object.keys(data).forEach(function (k) { lsDel(PREFIX + k); });
      vault = data;
      vaultKey = key;
      await rememberSession(key);
    },

    /** Check a PIN and unlock. Resolves true/false. */
    unlock: async function (pin) {
      const meta = lockMeta();
      if (!meta) return true;
      try {
        const key = await deriveKey(pin, unb64(meta.salt));
        await openVault(key);
        await rememberSession(key);
        return true;
      } catch (e) {
        return false;
      }
    },

    /** Verify a PIN without changing anything. */
    check: async function (pin) {
      const meta = lockMeta();
      if (!meta) return false;
      try {
        const key = await deriveKey(pin, unb64(meta.salt));
        await openJSON(key, lsGet(VAULT_KEY));
        return true;
      } catch (e) { return false; }
    },

    changePin: async function (pin) {
      const meta = lockMeta();
      if (!meta || !vault) throw new Error("locked");
      await store.flush();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(pin, salt);
      await media.rekey(vaultKey, key);
      lsSet(VAULT_KEY, await sealJSON(key, vault));
      meta.salt = b64(salt);
      meta.length = pin.length;
      saveMeta(meta);
      vaultKey = key;
      await rememberSession(key);
    },

    setGrace: function (sec) {
      const meta = lockMeta();
      if (!meta) return;
      meta.grace = sec;
      saveMeta(meta);
    },

    /** Turn the lock off: write everything back unencrypted. */
    disable: async function () {
      if (!vault) throw new Error("locked");
      await store.flush();
      await media.rekey(vaultKey, null);
      const data = vault;
      vault = null;
      vaultKey = null;
      Object.keys(data).forEach(function (k) { lsSet(PREFIX + k, JSON.stringify(data[k])); });
      lsDel(VAULT_KEY);
      lsDel(LOCK_KEY);
      lsDel(TRIES_KEY);
      forgetSession();
    },

    lockNow: function () {
      store.flush().then(function () {
        forgetSession();
        global.location.reload();
      });
    },

    /** Delete all Tendril data, the lock included. */
    eraseAll: async function () {
      const keys = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) keys.push(k);
        }
      } catch (e) { /* ignore */ }
      keys.forEach(lsDel);
      forgetSession();
      vault = null;
      vaultKey = null;
      await media.clear();
    }
  };

  // ---------------- Start-up: run page code once data is readable ----------------
  const readyQueue = [];
  let isReady = false;
  function ready(fn) { if (isReady) fn(); else readyQueue.push(fn); }
  function markReady() {
    isReady = true;
    document.documentElement.classList.remove("is-locked");
    const lockEl = document.getElementById("lock");
    if (lockEl) lockEl.remove();
    readyQueue.splice(0).forEach(function (fn) {
      try { fn(); } catch (e) { setTimeout(function () { throw e; }); }
    });
  }

  async function boot() {
    const meta = lockMeta();
    if (!meta) { markReady(); return; }
    document.documentElement.classList.add("is-locked");
    if (!sessionExpired(meta)) {
      try {
        const s = JSON.parse(ssGet(SESSION_KEY));
        await openVault(await importRaw(unb64(s.k)));
        markVisible();
        markReady();
        return;
      } catch (e) { forgetSession(); }
    }
    forgetSession();
    showLockScreen(meta);
  }

  // Leaving the app starts the lock timer; coming back after it ran out locks.
  document.addEventListener("visibilitychange", function () {
    const meta = lockMeta();
    if (!meta || !vault) return;
    if (document.visibilityState === "hidden") {
      markHidden();
    } else if (sessionExpired(meta)) {
      store.flush().then(function () { forgetSession(); global.location.reload(); });
    } else {
      markVisible();
    }
  });
  global.addEventListener("pagehide", markHidden);

  // ---------------- Lock screen ----------------
  function triesState() {
    try { return JSON.parse(lsGet(TRIES_KEY)) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; }
  }

  function showLockScreen(meta) {
    const build = function () {
      const el = document.createElement("div");
      el.id = "lock";
      el.className = "lock";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", "lock-title");
      el.innerHTML =
        '<div class="lock-inner">' +
          '<svg class="lock-logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 29c0-8 2-13 7-16 4-2.5 7-1 7 2s-3 4-5 2.5" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round"/><path d="M15 14c-1-5 2-9 7-10-0.5 5-3 8.5-7 10z" fill="var(--secondary)"/></svg>' +
          '<h1 id="lock-title" class="lock-title">Enter your PIN</h1>' +
          '<div class="lock-dots" aria-hidden="true"></div>' +
          '<p class="lock-msg" role="alert"></p>' +
          '<div class="lock-pad">' +
            [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-d="' + n + '">' + n + '</button>'; }).join("") +
            '<button type="button" class="lock-quiet" data-act="ok" aria-label="Unlock">OK</button>' +
            '<button type="button" data-d="0">0</button>' +
            '<button type="button" class="lock-quiet" data-act="del" aria-label="Delete last digit">⌫</button>' +
          '</div>' +
          '<div class="lock-foot">' +
            '<button type="button" class="lock-link" data-act="forgot">Forgot PIN?</button>' +
          '</div>' +
          '<div class="lock-forgot" hidden>' +
            '<p>A forgotten PIN can’t be recovered, because your data is encrypted with it. You can erase Tendril on this device and start fresh. If you made a backup, you can restore it afterwards.</p>' +
            '<button type="button" class="btn btn-pink btn-small" data-act="erase">Erase Tendril and start over</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(el);

      let pin = "";
      let busy = false;
      const dots = el.querySelector(".lock-dots");
      const msg = el.querySelector(".lock-msg");
      const len = meta.length || 4;

      function paint() {
        dots.innerHTML = "";
        const n = Math.max(len, pin.length);
        for (let i = 0; i < n; i++) {
          const d = document.createElement("span");
          if (i < pin.length) d.className = "on";
          dots.appendChild(d);
        }
      }
      function waitLeft() { return Math.max(0, Math.ceil((triesState().until - Date.now()) / 1000)); }
      function showWait() {
        const left = waitLeft();
        if (!left) { msg.textContent = ""; return; }
        msg.textContent = "Too many tries. Wait " + left + " s.";
        setTimeout(showWait, 1000);
      }

      async function submit() {
        if (busy || !pin) return;
        if (waitLeft()) { showWait(); return; }
        busy = true;
        el.classList.add("busy");
        msg.textContent = "Unlocking…";
        const ok = await lock.unlock(pin);
        busy = false;
        el.classList.remove("busy");
        if (ok) {
          lsDel(TRIES_KEY);
          markReady();
          return;
        }
        const t = triesState();
        t.n += 1;
        if (t.n >= 5) t.until = Date.now() + Math.min(300, 30 * Math.pow(2, t.n - 5)) * 1000;
        lsSet(TRIES_KEY, JSON.stringify(t));
        pin = "";
        paint();
        el.classList.add("shake");
        setTimeout(function () { el.classList.remove("shake"); }, 400);
        if (t.until > Date.now()) showWait();
        else msg.textContent = "That PIN didn’t work. Try again.";
      }

      function press(d) {
        if (busy) return;
        if (pin.length >= 8) return;
        pin += d;
        msg.textContent = "";
        paint();
        if (pin.length === len) submit();
      }

      el.addEventListener("click", function (ev) {
        const b = ev.target.closest("button, a");
        if (!b) return;
        if (b.dataset.d) press(b.dataset.d);
        else if (b.dataset.act === "del") { pin = pin.slice(0, -1); paint(); }
        else if (b.dataset.act === "ok") submit();
        else if (b.dataset.act === "forgot") { el.querySelector(".lock-forgot").hidden = false; b.hidden = true; }
        else if (b.dataset.act === "erase") {
          if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to erase everything"; return; }
          lock.eraseAll().then(function () { global.location.reload(); });
        } else if (b.hasAttribute("data-lock-exit")) { ev.preventDefault(); quickExit(); }
      });
      document.addEventListener("keydown", function (ev) {
        if (!document.getElementById("lock")) return;
        if (/^[0-9]$/.test(ev.key)) press(ev.key);
        else if (ev.key === "Backspace") { pin = pin.slice(0, -1); paint(); }
        else if (ev.key === "Enter") submit();
      });

      paint();
      showWait();
    };
    if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
  }

  // ---------------- Misc helpers ----------------
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

  const inFrame = (function () { try { return global.top !== global && global.top.location.origin === location.origin; } catch (e) { return false; } })();
  function quickExit() {
    if (vault) { forgetSession(); }
    try { (inFrame ? global.top : global).location.replace(EXIT_URL); }
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

  // ---------------- Section tabs keep your place ----------------
  // Tapping a tab (Pitch / Resonance, Doses / Labs, Story / Body…) opens another page.
  // Remember where the tab bar was on screen and put it back there, instead of jumping to the top.
  function ssSet(k, v) { try { global.sessionStorage.setItem(k, v); } catch (e) { /* unavailable */ } }
  function ssTake(k) { try { const v = global.sessionStorage.getItem(k); global.sessionStorage.removeItem(k); return v; } catch (e) { return null; } }

  function wireTabs() {
    document.querySelectorAll(".voice-tabs a").forEach(function (a) {
      a.addEventListener("click", function () {
        const bar = a.closest(".voice-tabs");
        ssSet("tendril:tabPos", JSON.stringify({ to: new URL(a.href, location.href).pathname, top: bar.getBoundingClientRect().top, at: Date.now() }));
      });
    });
    // Main menu: remember how far it was scrolled sideways.
    const nav = document.querySelector(".nav");
    if (nav) {
      const remember = function () { ssSet("tendril:navX", String(Math.round(nav.scrollLeft))); };
      nav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", remember); });
      nav.addEventListener("scroll", remember, { passive: true });
    }
    whenOpened(restorePlaces);
  }

  function whenOpened(fn) {
    if (document.prerendering) document.addEventListener("prerenderingchange", fn, { once: true });
    else fn();
  }

  // Keep the main menu where it was, and make sure the current page's tab is in view.
  function placeNav() {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const x = parseInt(ssTake("tendril:navX"), 10);
    if (isFinite(x)) nav.scrollLeft = x;
    const cur = nav.querySelector('[aria-current="page"]');
    if (cur) {
      const r = cur.getBoundingClientRect(), n = nav.getBoundingClientRect();
      if (r.left < n.left + 4 || r.right > n.right - 4) nav.scrollLeft += (r.left - n.left) - (n.width - r.width) / 2;
    }
  }

  function restorePlaces() {
    placeNav();
    let saved = null;
    try { saved = JSON.parse(ssTake("tendril:tabPos") || "null"); } catch (e) { saved = null; }
    if (!saved || saved.to !== location.pathname || Date.now() - saved.at > 10000) return;
    const bar = document.querySelector(".voice-tabs");
    if (!bar) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const place = function () {
      const y = global.scrollY + bar.getBoundingClientRect().top - saved.top;
      if (y > 0) global.scrollTo(0, y);
    };
    place();
    // Page content can arrive a moment later (after unlocking, or once scripts render), so try again.
    global.requestAnimationFrame(place);
    setTimeout(place, 120);
    ready(function () { setTimeout(place, 30); });
  }

  // Load the menu pages quietly in the background, so tapping a tab opens it at once
  // (no loading bar). Browsers without support just navigate normally.
  function preloadTabs() {
    if (inFrame || !/^https?:/.test(location.protocol) || document.querySelector('script[type="speculationrules"]')) return;
    if (!(global.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules"))) return;
    const rules = { prerender: [
      { source: "document", where: { selector_matches: ".nav a.navlink:not([aria-current])" }, eagerness: "eager" },
      { source: "document", where: { selector_matches: ".voice-tabs a:not([aria-current]), .tool-link, .hard-fab" }, eagerness: "moderate" }
    ] };
    const s = document.createElement("script");
    s.type = "speculationrules";
    s.textContent = JSON.stringify(rules);
    document.head.appendChild(s);
  }

  // A skipped page fade (e.g. the page was hidden) isn't an error worth reporting.
  global.addEventListener("pagereveal", function (e) {
    const vt = e.viewTransition;
    if (vt) [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (pr) { if (pr) pr.catch(function () {}); });
  });

  // Position the menu straight away (common.js runs at the end of the page, before it's drawn).
  whenOpened(placeNav);

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", wireQuickExit); document.addEventListener("DOMContentLoaded", wireTabs); document.addEventListener("DOMContentLoaded", preloadTabs); }
  else { wireQuickExit(); wireTabs(); preloadTabs(); }

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
    if (inFrame) return true; // inside the installed app's container (app.html)
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
    bar.querySelector("button").addEventListener("click", function () {
      store.flush().then(function () { worker.postMessage("skip-waiting"); });
    });
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

  global.Tendril = {
    ready: ready, lock: lock, blobs: blobs, photos: photos, keepStorage: keepStorage,
    isStandalone: isStandalone, promptInstall: promptInstall,
    canPromptInstall: function () { return !!installPrompt; },
    store: store, quickExit: quickExit, uid: uid, download: download, toast: toast,
    relDays: relDays, fmtDate: fmtDate
  };

  // A page loaded ahead of time (see preloadTabs) waits until it's opened before unlocking and rendering.
  if (document.prerendering) document.addEventListener("prerenderingchange", function () { boot(); }, { once: true });
  else boot();
})(window);
