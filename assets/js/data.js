/* Tendril backup, restore and delete. Backups can be encrypted with a password
   (PBKDF2 + AES-GCM via the browser's Web Crypto API). Nothing leaves the device. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril;
  const $ = function (id) { return document.getElementById(id); };
  const FORMAT = "tendril-backup";
  const ITERATIONS = 250000;

  // ---------------- What's stored ----------------
  function describe(data) {
    const out = [];
    const meds = data["doses.meds"] || [], log = data["doses.log"] || [];
    if (meds.length || log.length) out.push(["Doses", meds.length + plural(meds.length, " medication", " medications") + ", " + log.length + plural(log.length, " logged dose", " logged doses")]);
    const voice = data["voice.history"] || [];
    if (voice.length) out.push(["Voice practice", voice.length + plural(voice.length, " session", " sessions")]);
    if (data["voice.target"]) out.push(["Voice target", data["voice.target"].low + "–" + data["voice.target"].high + " Hz"]);
    const short = data["names.shortlist"] || [];
    if (short.length) out.push(["Name shortlist", short.length + plural(short.length, " name", " names")]);
    const entries = data["timeline.entries"] || [];
    if (entries.length) out.push(["Timeline", entries.length + plural(entries.length, " entry", " entries")]);
    const visits = data["visits.list"] || [];
    if (visits.length) out.push(["Appointments", visits.length + plural(visits.length, " appointment", " appointments")]);
    const labTests = data["labs.tests"] || [];
    if (labTests.length) out.push(["Lab results", labTests.length + plural(labTests.length, " test", " tests")]);
    const res = data["resonance.history"] || [];
    if (res.length) out.push(["Resonance practice", res.length + plural(res.length, " session", " sessions")]);
    const gp = data["games.plays"] || [];
    if (gp.length) out.push(["Voice games", gp.length + plural(gp.length, " game played", " games played")]);
    const wu = data["warmup.log"] || [];
    if (wu.length) out.push(["Voice warm-ups", wu.length + plural(wu.length, " warm-up", " warm-ups")]);
    const jar = data["jar.notes"] || [];
    if (jar.length) out.push(["Euphoria jar", jar.length + plural(jar.length, " moment", " moments")]);
    const drafts = data["comingout.drafts"] || [];
    if (drafts.length) out.push(["Coming-out drafts", drafts.length + plural(drafts.length, " draft", " drafts")]);
    const checks = data["guides.checklist"] ? Object.keys(data["guides.checklist"]).length : 0;
    if (checks) out.push(["Name-change checklist", checks + " ticked"]);
    return out;
  }
  function plural(n, one, many) { return n === 1 ? one : many; }

  function currentData() {
    const data = {};
    T.store.keys().forEach(function (k) { data[k] = T.store.get(k, null); });
    return data;
  }

  function renderList(host, rows, emptyText) {
    host.innerHTML = "";
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "none";
      li.textContent = emptyText;
      host.appendChild(li);
      return;
    }
    rows.forEach(function (r) {
      const li = document.createElement("li");
      li.innerHTML = "<span></span><strong></strong>";
      li.querySelector("span").textContent = r[0];
      li.querySelector("strong").textContent = r[1];
      host.appendChild(li);
    });
  }

  function renderStored() {
    $("storage-off").hidden = T.store.available();
    const rows = describe(currentData());
    renderList($("stored"), rows, "Nothing saved yet.");
    // Recordings and photos live in IndexedDB; count them separately.
    Promise.all([T.blobs.count(), T.blobs.totalBytes(), T.photos.keys(), T.photos.totalBytes()]).then(function (r) {
      const nPhotos = (r[2] || []).filter(function (k) { return !/:thumb$/.test(k); }).length;
      if (nPhotos) rows.push(["Photos", nPhotos + plural(nPhotos, " photo", " photos") + ", " + mb(r[3])]);
      if (r[0]) rows.push(["Voice recordings", r[0] + plural(r[0], " recording", " recordings") + ", " + mb(r[1])]);
      renderList($("stored"), rows, "Nothing saved yet.");
    }).catch(function () { /* none */ });
  }
  function mb(bytes) { return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1048576).toFixed(1) + " MB"; }

  // ---------------- Crypto helpers ----------------
  const enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // Photos and recordings, decrypted if the lock is on, as base64 for the backup file.
  async function collectMedia() {
    const out = {};
    for (const name of ["photos", "recordings"]) {
      const storeApi = name === "photos" ? T.photos : T.blobs;
      out[name] = {};
      const keys = await storeApi.keys().catch(function () { return []; });
      for (const id of keys) {
        const blob = await storeApi.get(id).catch(function () { return null; });
        if (blob) out[name][id] = { type: blob.type, data: b64(await blob.arrayBuffer()) };
      }
    }
    return out;
  }
  async function writeMedia(media) {
    for (const name of ["photos", "recordings"]) {
      const storeApi = name === "photos" ? T.photos : T.blobs;
      const items = media[name] || {};
      if (!Object.keys(items).length) continue;
      await storeApi.clear().catch(function () { /* empty */ });
      for (const id of Object.keys(items)) {
        await storeApi.put(id, new Blob([unb64(items[id].data)], { type: items[id].type }));
      }
    }
  }
  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function keyFrom(password, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  // ---------------- Backup ----------------
  $("backup").addEventListener("click", async function () {
    const data = currentData();
    if (!Object.keys(data).length) { T.toast("Nothing to back up yet"); return; }
    const withMedia = $("backup-media").checked;
    const btn = $("backup");
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = withMedia ? "Packing photos and recordings…" : "Preparing…";
    const media = withMedia ? await collectMedia() : null;
    btn.disabled = false;
    btn.textContent = label;
    const payload = JSON.stringify({ exported: new Date().toISOString(), data: data, media: media || undefined });
    const pass = $("backup-pass").value;
    let file;
    try {
      if (pass) {
        if (!window.crypto || !crypto.subtle) throw new Error("no-crypto");
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await keyFrom(pass, salt);
        const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(payload));
        file = { format: FORMAT, version: 1, encrypted: true, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: b64(salt) }, iv: b64(iv), ciphertext: b64(ct) };
      } else {
        file = Object.assign({ format: FORMAT, version: 1, encrypted: false }, JSON.parse(payload));
      }
    } catch (e) {
      T.toast("Couldn’t encrypt in this browser. Try without a password or another browser.");
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    T.download("tendril-backup-" + day + ".json", JSON.stringify(file, null, pass || withMedia ? 0 : 2), "application/json");
    $("backup-pass").value = "";
    T.toast(pass ? "Encrypted backup downloaded" : "Backup downloaded");
  });

  // ---------------- Restore ----------------
  let pendingFile = null, pendingData = null, pendingMedia = null;

  function resetRestore() {
    pendingFile = pendingData = pendingMedia = null;
    $("restore-pass-step").hidden = true;
    $("restore-confirm").hidden = true;
    $("restore-error").hidden = true;
    $("restore-pass").value = "";
  }
  function restoreError(msg) { $("restore-error").textContent = msg; $("restore-error").hidden = false; }

  function showConfirm(obj) {
    if (!obj || typeof obj.data !== "object") { restoreError("That backup looks damaged. Try another file."); return; }
    const keys = Object.keys(obj.data).filter(function (k) { return /^[a-z]+\.[a-zA-Z]+$/.test(k); });
    if (!keys.length) { restoreError("That backup is empty."); return; }
    pendingData = {};
    keys.forEach(function (k) { pendingData[k] = obj.data[k]; });
    const rows = describe(pendingData);
    pendingMedia = obj.media && typeof obj.media === "object" ? obj.media : null;
    if (pendingMedia) {
      const np = Object.keys(pendingMedia.photos || {}).filter(function (k) { return !/:thumb$/.test(k); }).length;
      const nr = Object.keys(pendingMedia.recordings || {}).length;
      if (np) rows.push(["Photos", np + plural(np, " photo", " photos")]);
      if (nr) rows.push(["Voice recordings", nr + plural(nr, " recording", " recordings")]);
    }
    renderList($("restore-summary"), rows, "No recognizable data.");
    $("restore-date").textContent = obj.exported ? "Made on " + T.fmtDate(obj.exported, true) + "." : "";
    $("restore-pass-step").hidden = true;
    $("restore-confirm").hidden = false;
  }

  $("restore-file").addEventListener("change", async function () {
    const f = this.files && this.files[0];
    this.value = "";
    resetRestore();
    if (!f) return;
    let obj;
    try { obj = JSON.parse(await f.text()); }
    catch (e) { restoreError("That file isn’t a Tendril backup."); return; }
    if (!obj || obj.format !== FORMAT) { restoreError("That file isn’t a Tendril backup."); return; }
    if (obj.encrypted) {
      pendingFile = obj;
      $("restore-pass-step").hidden = false;
      $("restore-pass").focus();
    } else {
      showConfirm(obj);
    }
  });

  async function unlock() {
    if (!pendingFile) return;
    $("restore-error").hidden = true;
    try {
      const key = await keyFrom($("restore-pass").value, unb64(pendingFile.kdf.salt));
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(pendingFile.iv) }, key, unb64(pendingFile.ciphertext));
      showConfirm(JSON.parse(dec.decode(pt)));
    } catch (e) {
      restoreError("That password didn’t work. Check it and try again.");
    }
  }
  $("unlock").addEventListener("click", unlock);
  $("restore-pass").addEventListener("keydown", function (ev) { if (ev.key === "Enter") unlock(); });

  $("restore-go").addEventListener("click", async function () {
    if (!pendingData) return;
    const btn = $("restore-go");
    btn.disabled = true;
    btn.textContent = "Restoring…";
    T.store.keys().forEach(function (k) { T.store.remove(k); });
    Object.keys(pendingData).forEach(function (k) { T.store.set(k, pendingData[k]); });
    try { if (pendingMedia) await writeMedia(pendingMedia); }
    catch (e) { T.toast("Your data was restored, but some photos or recordings couldn’t be"); }
    await T.store.flush();
    btn.disabled = false;
    btn.textContent = "Replace with backup";
    resetRestore();
    renderStored();
    T.toast("Backup restored");
  });
  $("restore-cancel").addEventListener("click", resetRestore);

  // ---------------- Delete everything ----------------
  $("wipe").addEventListener("click", function () { $("wipe").hidden = true; $("wipe-confirm").hidden = false; });
  $("wipe-no").addEventListener("click", function () { $("wipe").hidden = false; $("wipe-confirm").hidden = true; });
  $("wipe-yes").addEventListener("click", function () {
    T.lock.eraseAll().then(function () {
      $("wipe").hidden = false;
      $("wipe-confirm").hidden = true;
      renderStored();
      renderLock();
      T.toast("All Tendril data deleted from this device");
    });
  });

  // ---------------- App lock ----------------
  function renderLock() {
    const on = T.lock.enabled();
    $("lock-off").hidden = on;
    $("lock-on").hidden = !on;
    $("lock-status").textContent = on ? "On" : "Off";
    $("lock-status").classList.toggle("on", on);
    if (on) $("pin-grace-on").value = String(T.lock.settings().grace);
  }

  function pinProblem(a, b) {
    if (!/^[0-9]{4,8}$/.test(a)) return "Use 4 to 8 digits, numbers only.";
    if (a !== b) return "The two PINs don’t match.";
    if (/^(\d)\1+$/.test(a) || "0123456789".indexOf(a) >= 0 || "9876543210".indexOf(a) >= 0) return "That PIN is easy to guess. Try something less predictable.";
    return "";
  }
  function showErr(id, msg) { $(id).textContent = msg; $(id).hidden = !msg; }
  function busy(btn, label) {
    btn.disabled = !!label;
    if (label) { btn.dataset.label = btn.textContent; btn.textContent = label; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  $("lock-on-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const a = $("pin-new").value, b = $("pin-new2").value;
    const problem = pinProblem(a, b);
    showErr("lock-on-error", problem);
    if (problem) return;
    if (!window.crypto || !crypto.subtle) { showErr("lock-on-error", "This browser can’t encrypt data, so the lock isn’t available here."); return; }
    busy($("lock-on-btn"), "Encrypting your data…");
    try {
      await T.lock.enable(a, parseInt($("pin-grace").value, 10));
      $("pin-new").value = $("pin-new2").value = "";
      T.toast("App lock is on");
    } catch (e) {
      showErr("lock-on-error", "Couldn’t turn on the lock. Nothing was changed.");
    }
    busy($("lock-on-btn"), null);
    renderLock();
    renderStored();
  });

  $("pin-grace-on").addEventListener("change", function () {
    T.lock.setGrace(parseInt($("pin-grace-on").value, 10));
    T.toast("Saved");
  });

  $("lock-now").addEventListener("click", function () { T.lock.lockNow(); });

  $("lock-change-form").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    showErr("lock-chg-error", "");
    const a = $("pin-chg").value, b = $("pin-chg2").value;
    const problem = pinProblem(a, b);
    if (problem) { showErr("lock-chg-error", problem); return; }
    busy($("lock-chg-btn"), "Checking…");
    const ok = await T.lock.check($("pin-cur").value);
    if (!ok) { busy($("lock-chg-btn"), null); showErr("lock-chg-error", "Your current PIN isn’t right."); return; }
    $("lock-chg-btn").textContent = "Re-encrypting…";
    try {
      await T.lock.changePin(a);
      ["pin-cur", "pin-chg", "pin-chg2"].forEach(function (id) { $(id).value = ""; });
      T.toast("PIN changed");
    } catch (e) {
      showErr("lock-chg-error", "Couldn’t change the PIN. Your old PIN still works.");
    }
    busy($("lock-chg-btn"), null);
  });

  const offBtn = $("lock-off-btn");
  offBtn.addEventListener("click", async function () {
    showErr("lock-chg-error", "");
    const cur = $("pin-cur").value;
    if (!cur) { showErr("lock-chg-error", "Enter your current PIN to turn the lock off."); $("pin-cur").focus(); return; }
    if (!offBtn.dataset.armed) {
      offBtn.dataset.armed = "1";
      offBtn.textContent = "Tap again: data will be stored unencrypted";
      setTimeout(function () { delete offBtn.dataset.armed; offBtn.textContent = "Turn off app lock"; }, 4000);
      return;
    }
    delete offBtn.dataset.armed;
    busy(offBtn, "Checking…");
    if (!(await T.lock.check(cur))) { busy(offBtn, null); offBtn.textContent = "Turn off app lock"; showErr("lock-chg-error", "Your current PIN isn’t right."); return; }
    try {
      await T.lock.disable();
      $("pin-cur").value = "";
      T.toast("App lock is off");
    } catch (e) {
      showErr("lock-chg-error", "Couldn’t turn off the lock.");
    }
    busy(offBtn, null);
    offBtn.textContent = "Turn off app lock";
    renderLock();
  });

  renderLock();
  renderStored();
});
