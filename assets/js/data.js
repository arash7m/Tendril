/* Tendril backup, restore and delete. Backups can be encrypted with a password
   (PBKDF2 + AES-GCM via the browser's Web Crypto API). Nothing leaves the device. */
(function () {
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
    renderList($("stored"), describe(currentData()), "Nothing saved yet.");
  }

  // ---------------- Crypto helpers ----------------
  const enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
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
    const payload = JSON.stringify({ exported: new Date().toISOString(), data: data });
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
    T.download("tendril-backup-" + day + ".json", JSON.stringify(file, null, pass ? 0 : 2), "application/json");
    $("backup-pass").value = "";
    T.toast(pass ? "Encrypted backup downloaded" : "Backup downloaded");
  });

  // ---------------- Restore ----------------
  let pendingFile = null, pendingData = null;

  function resetRestore() {
    pendingFile = pendingData = null;
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
    renderList($("restore-summary"), describe(pendingData), "No recognizable data.");
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

  $("restore-go").addEventListener("click", function () {
    if (!pendingData) return;
    T.store.keys().forEach(function (k) { T.store.remove(k); });
    Object.keys(pendingData).forEach(function (k) { T.store.set(k, pendingData[k]); });
    resetRestore();
    renderStored();
    T.toast("Backup restored");
  });
  $("restore-cancel").addEventListener("click", resetRestore);

  // ---------------- Delete everything ----------------
  $("wipe").addEventListener("click", function () { $("wipe").hidden = true; $("wipe-confirm").hidden = false; });
  $("wipe-no").addEventListener("click", function () { $("wipe").hidden = false; $("wipe-confirm").hidden = true; });
  $("wipe-yes").addEventListener("click", function () {
    T.store.keys().forEach(function (k) { T.store.remove(k); });
    $("wipe").hidden = false;
    $("wipe-confirm").hidden = true;
    renderStored();
    T.toast("All Tendril data deleted from this device");
  });

  renderStored();
})();
