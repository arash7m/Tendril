/* Tendril timeline: journal entries, milestones and photos in one feed.
   Entries live in tendril:timeline.entries; photos in the "photos" store
   (full image under its id, a small copy under id + ":thumb"). */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, D = window.TendrilDays;
  const $ = function (id) { return document.getElementById(id); };

  const TAGS = ["euphoria", "dysphoria", "voice", "body", "skin", "energy", "social", "health"];
  const MOODS = { 1: "Rough", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
  const FULL_MAX = 1600, THUMB_MAX = 480;

  let entries = T.store.get("timeline.entries", []);
  let filter = "all";

  function save() { T.store.set("timeline.entries", entries); }
  function sorted() { return entries.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); }); }
  function allPhotos() {
    // Oldest first, each with the entry it belongs to.
    const out = [];
    // A photo is dated by its entry, so moving an entry's date moves its photos too.
    entries.forEach(function (e) { (e.photos || []).forEach(function (p) { out.push({ id: p.id, at: e.at, entry: e }); }); });
    return out.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  // ---------------- Photo URLs (decrypted on demand, cached) ----------------
  const urls = {};
  function photoUrl(id, thumb) {
    const key = thumb ? id + ":thumb" : id;
    if (!urls[key]) {
      urls[key] = T.photos.get(key).then(function (blob) {
        if (!blob && thumb) return photoUrl(id, false);
        return blob ? URL.createObjectURL(blob) : "";
      }).catch(function () { return ""; });
    }
    return urls[key];
  }
  function setImg(img, id, thumb) {
    img.dataset.pid = id;
    photoUrl(id, thumb).then(function (u) { if (img.dataset.pid === id && u) img.src = u; });
  }
  function forget(id) {
    [id, id + ":thumb"].forEach(function (k) {
      if (urls[k]) urls[k].then(function (u) { if (u) URL.revokeObjectURL(u); });
      delete urls[k];
    });
  }

  // ---------------- Image processing ----------------
  // Re-drawing through a canvas removes location and camera metadata.
  function canvasBlob(source, sw, sh, max, quality, mirror) {
    const scale = Math.min(1, max / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(source, 0, 0, w, h);
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) { b ? resolve(b) : reject(new Error("encode")); }, "image/jpeg", quality);
    });
  }

  async function storePhoto(source, sw, sh, mirror) {
    const id = "p" + T.uid();
    const full = await canvasBlob(source, sw, sh, FULL_MAX, 0.88, mirror);
    const thumb = await canvasBlob(source, sw, sh, THUMB_MAX, 0.8, mirror);
    await T.photos.put(id, full);
    await T.photos.put(id + ":thumb", thumb);
    T.keepStorage();
    return id;
  }

  async function importFile(file) {
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      bmp = await new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    return storePhoto(bmp, w, h, false);
  }

  async function deletePhotoBlobs(id) {
    forget(id);
    await T.photos.del(id).catch(function () { /* gone */ });
    await T.photos.del(id + ":thumb").catch(function () { /* gone */ });
  }

  // ---------------- Dates ----------------
  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function daysSince(d) { return Math.round((dayStart(new Date()) - dayStart(d)) / 86400000); }
  function sinceText(d) {
    const n = daysSince(d);
    if (n < 0) return "in " + (-n) + (n === -1 ? " day" : " days");
    if (n === 0) return "today";
    if (n < 60) return n + (n === 1 ? " day" : " days");
    const months = Math.floor(n / 30.44);
    if (n < 730) return months + " months";
    const years = Math.floor(n / 365.25), rest = Math.floor((n - years * 365.25) / 30.44);
    return years + (years === 1 ? " year" : " years") + (rest ? ", " + rest + (rest === 1 ? " month" : " months") : "");
  }
  function shortDate(d, withYear) {
    return new Date(d).toLocaleDateString(undefined, withYear ? { day: "numeric", month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" });
  }
  function monthLabel(d) { return new Date(d).toLocaleDateString(undefined, { month: "long", year: "numeric" }); }
  function timeText(d) {
    return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + " · " +
      new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  function localInputValue(d) {
    const pad = function (n) { return String(n).padStart(2, "0"); };
    d = new Date(d);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // ---------------- Render ----------------
  function voiceItems() {
    return T.store.get("voice.history", []).map(function (h) { return { voice: true, at: h.at, h: h }; });
  }

  function matches(item) {
    if (filter === "all") return true;
    if (filter === "voice") return !!item.voice;
    if (item.voice) return false;
    if (filter === "journal") return item.kind !== "milestone";
    if (filter === "milestone") return item.kind === "milestone";
    if (filter === "photos") return (item.photos || []).length > 0;
    if (filter.indexOf("tag:") === 0) return (item.tags || []).indexOf(filter.slice(4)) >= 0;
    return true;
  }

  function render() {
    const feed = $("feed");
    feed.innerHTML = "";
    const items = sorted().concat(filter === "all" || filter === "voice" ? voiceItems() : [])
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); })
      .filter(matches);

    const hasAny = entries.length > 0 || voiceItems().length > 0;
    $("tl-empty").hidden = hasAny;
    $("filter-empty").hidden = !hasAny || items.length > 0;
    $("open-compare").hidden = allPhotos().length < 2;

    let month = "";
    let group = null;
    items.forEach(function (item) {
      const m = monthLabel(item.at);
      if (m !== month) {
        month = m;
        const sec = document.createElement("section");
        sec.className = "month";
        const h = document.createElement("h2");
        h.className = "month-h";
        h.textContent = m;
        sec.appendChild(h);
        group = document.createElement("ol");
        group.className = "month-list";
        sec.appendChild(group);
        feed.appendChild(sec);
      }
      group.appendChild(item.voice ? voiceCard(item.h) : entryCard(item));
    });
    renderMilestones();
  }

  function entryCard(e) {
    const li = document.createElement("li");
    li.className = "tl-card" + (e.kind === "milestone" ? " is-milestone" : "");
    li.innerHTML =
      '<div class="tl-head"><span class="tl-when"></span><span class="tl-mood" hidden></span>' +
      '<button class="icon-btn tl-edit" type="button" aria-label="Edit entry"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg></button></div>' +
      '<h3 class="tl-ms" hidden></h3>' +
      '<p class="tl-text" hidden></p>' +
      '<button class="tl-more" type="button" hidden>Show more</button>' +
      '<div class="tl-photos" hidden></div>' +
      '<div class="tl-tags" hidden></div>';
    li.querySelector(".tl-when").textContent = timeText(e.at);
    if (e.mood) {
      const m = li.querySelector(".tl-mood");
      m.hidden = false;
      m.textContent = MOODS[e.mood];
      m.dataset.mood = e.mood;
    }
    if (e.kind === "milestone") {
      const ms = li.querySelector(".tl-ms");
      ms.hidden = false;
      ms.textContent = e.title || "Milestone";
    }
    if (e.text) {
      const t = li.querySelector(".tl-text");
      t.hidden = false;
      t.textContent = e.text;
      if (e.text.length > 320 || e.text.split("\n").length > 6) {
        t.classList.add("clamped");
        const more = li.querySelector(".tl-more");
        more.hidden = false;
        more.addEventListener("click", function () {
          const open = t.classList.toggle("clamped");
          more.textContent = open ? "Show more" : "Show less";
        });
      }
    }
    if ((e.photos || []).length) {
      const box = li.querySelector(".tl-photos");
      box.hidden = false;
      box.dataset.n = Math.min(e.photos.length, 4);
      e.photos.forEach(function (p) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tl-photo";
        b.setAttribute("aria-label", "Open photo");
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        setImg(img, p.id, true);
        b.appendChild(img);
        b.addEventListener("click", function () { openViewer(p.id); });
        box.appendChild(b);
      });
    }
    if ((e.tags || []).length) {
      const box = li.querySelector(".tl-tags");
      box.hidden = false;
      e.tags.forEach(function (t) {
        const s = document.createElement("span");
        s.className = "tag tag-" + t;
        s.textContent = t;
        box.appendChild(s);
      });
    }
    li.querySelector(".tl-edit").addEventListener("click", function () { openEntry(e); });
    return li;
  }

  function voiceCard(h) {
    const li = document.createElement("li");
    li.className = "tl-card tl-voice";
    li.innerHTML = '<a href="voice.html"><span class="tl-when"></span><span class="tl-vline"><strong>Voice practice</strong> <span></span></span></a>';
    li.querySelector(".tl-when").textContent = timeText(h.at);
    li.querySelector(".tl-vline span").textContent = h.avg + " Hz average · " + h.inRange + "% in range";
    return li;
  }

  function renderMilestones() {
    const ms = D.milestones(T.store);
    const todays = D.today(ms);
    $("milestones").hidden = ms.length === 0;
    const strip = $("ms-strip");
    strip.innerHTML = "";
    ms.forEach(function (e) {
      const occ = todays.find(function (o) { return o.ms === e; });
      const nx = occ ? null : D.next(e);
      const d = document.createElement("button");
      d.type = "button";
      d.className = "ms-card" + (occ ? " is-anniv" : "");
      const n = daysSince(e.at);
      d.innerHTML = '<span class="ms-num"></span><span class="ms-title"></span><span class="ms-sub"></span><span class="ms-next" hidden></span>';
      d.querySelector(".ms-num").textContent = occ ? occ.label + " today" : sinceText(e.at);
      d.querySelector(".ms-title").textContent = e.title || "Milestone";
      d.querySelector(".ms-sub").textContent = (n >= 0 ? "since " : "on ") + shortDate(e.at, true);
      if (nx && n >= 0) {
        const t = d.querySelector(".ms-next");
        t.hidden = false;
        t.textContent = nx.label + " " + D.inText(nx.inDays);
      }
      d.addEventListener("click", function () { openEntry(e); });
      strip.appendChild(d);
    });

    // Coming up: the next few celebrations across all milestones
    const coming = D.upcoming(ms, 400).slice(0, 3);
    $("coming").hidden = !coming.length;
    const list = $("coming-list");
    list.innerHTML = "";
    coming.forEach(function (o) {
      const li = document.createElement("li");
      li.innerHTML = '<span class="cm-when"></span><span class="cm-what"><strong></strong> <span></span></span>';
      li.querySelector(".cm-when").textContent = o.inDays <= 31 ? D.inText(o.inDays) : shortDate(o.date, o.inDays > 300);
      li.querySelector("strong").textContent = o.label;
      li.querySelector(".cm-what span").textContent = "· " + (o.ms.title || "Milestone");
      if (o.inDays <= 31) li.title = shortDate(o.date);
      list.appendChild(li);
    });

    renderCelebration(todays);
    renderSuggestion(ms);
  }

  let celebrated = false;
  function renderCelebration(todays) {
    const box = $("celebrate");
    box.hidden = !todays.length;
    if (!todays.length) return;
    const top = todays[0];
    $("cel-title").textContent = top.label;
    $("cel-what").textContent = top.ms.title || "Milestone";
    const others = todays.slice(1).map(function (o) { return o.label + " · " + (o.ms.title || "Milestone"); });
    $("cel-sub").textContent = "Since " + shortDate(top.ms.at, true) + ". Look how far you’ve come." + (others.length ? " Also today: " + others.join(", ") + "." : "");
    if (!celebrated) {
      celebrated = true;
      const fresh = todays.filter(function (o) { return D.firstTimeToday(T.store, o); }).length > 0;
      if (fresh) setTimeout(function () { D.confettiFrom(box, { count: 90, stagger: 0.5 }); }, 350);
    }
  }
  $("cel-again").addEventListener("click", function () { D.confettiFrom($("celebrate"), { count: 90, stagger: 0.4 }); });
  $("cel-write").addEventListener("click", function () {
    const top = D.today(D.milestones(T.store))[0];
    openEntry(null);
    if (top) {
      $("entry-text").value = top.label + " since " + (top.ms.title || "this milestone").replace(/^./, function (c) { return c.toLowerCase(); }) + ". ";
      renderTagPills(["euphoria"]);
    }
  });

  // Suggest marking the day hormones started, from the first logged dose.
  function renderSuggestion(ms) {
    const first = D.firstDose(T.store);
    const show = !!first && !D.hrtMilestone(ms) && !T.store.get("days.hrtTipHidden", false);
    $("ms-suggest").hidden = !show;
    if (!show) return;
    $("ms-suggest-text").textContent = "Your first logged dose was on " + shortDate(first.at, true) +
      ". Want to mark the day you started hormones? You can change the date if you started earlier.";
  }
  $("ms-suggest-yes").addEventListener("click", function () {
    const first = D.firstDose(T.store);
    openEntry(null, { kind: "milestone" });
    $("ms-title").value = "Started hormones";
    if (first) $("entry-when").value = localInputValue(first.at);
  });
  $("ms-suggest-no").addEventListener("click", function () {
    T.store.set("days.hrtTipHidden", true);
    $("ms-suggest").hidden = true;
  });

  // ---------------- Entry editor ----------------
  let editing = null;      // the entry being edited, or null for new
  let draftPhotos = [];    // [{id, at}]
  let addedThisTime = [];  // ids stored during this edit, deleted if cancelled
  let removedThisTime = [];
  let saved = false;

  function renderTagPills(selected) {
    const host = $("tag-pills");
    host.innerHTML = "";
    TAGS.forEach(function (t) {
      const l = document.createElement("label");
      l.innerHTML = '<input type="checkbox"><span></span>';
      l.querySelector("input").value = t;
      l.querySelector("input").checked = selected.indexOf(t) >= 0;
      l.querySelector("span").textContent = t.charAt(0).toUpperCase() + t.slice(1);
      host.appendChild(l);
    });
  }

  function renderDraftPhotos() {
    const host = $("draft-photos");
    host.innerHTML = "";
    draftPhotos.forEach(function (p) {
      const d = document.createElement("div");
      d.className = "draft-photo";
      const img = document.createElement("img");
      img.alt = "";
      setImg(img, p.id, true);
      const x = document.createElement("button");
      x.type = "button";
      x.className = "draft-x";
      x.setAttribute("aria-label", "Remove photo");
      x.textContent = "×";
      x.addEventListener("click", function () {
        draftPhotos = draftPhotos.filter(function (q) { return q.id !== p.id; });
        if (addedThisTime.indexOf(p.id) >= 0) {
          addedThisTime = addedThisTime.filter(function (i) { return i !== p.id; });
          deletePhotoBlobs(p.id);
        } else {
          removedThisTime.push(p.id);
        }
        renderDraftPhotos();
      });
      d.appendChild(img);
      d.appendChild(x);
      host.appendChild(d);
    });
  }

  function setKind(kind) {
    document.querySelectorAll('#entry-form input[name="kind"]').forEach(function (r) { r.checked = r.value === kind; });
    $("ms-title-field").hidden = kind !== "milestone";
    $("ms-presets").hidden = kind !== "milestone";
    $("ms-remind").hidden = !(kind === "milestone" && editing && editing.kind === "milestone");
    $("entry-text").placeholder = kind === "milestone" ? "Anything you want to remember about it" : "How are you feeling today?";
  }

  function openEntry(e, opts) {
    editing = e || null;
    saved = false;
    addedThisTime = [];
    removedThisTime = [];
    draftPhotos = e ? (e.photos || []).slice() : [];
    $("entry-title").textContent = e ? (e.kind === "milestone" ? "Edit milestone" : "Edit entry") : (opts && opts.kind === "milestone" ? "New milestone" : "New entry");
    setKind(e ? e.kind || "journal" : (opts && opts.kind) || "journal");
    $("ms-title").value = e ? e.title || "" : "";
    $("entry-when").value = localInputValue(e ? e.at : new Date());
    $("entry-text").value = e ? e.text || "" : "";
    document.querySelectorAll('#mood-pills input').forEach(function (r) { r.checked = !!(e && String(e.mood) === r.value); });
    renderTagPills(e ? e.tags || [] : []);
    if (opts && opts.photoId) { draftPhotos.push({ id: opts.photoId, at: new Date().toISOString() }); addedThisTime.push(opts.photoId); }
    renderDraftPhotos();
    const del = $("entry-delete");
    del.hidden = !e;
    del.textContent = "Delete entry";
    delete del.dataset.armed;
    $("entry-sheet").showModal();
  }

  document.querySelectorAll('#entry-form input[name="kind"]').forEach(function (r) {
    r.addEventListener("change", function () { setKind(r.value); });
  });
  $("ms-presets").addEventListener("click", function (ev) {
    const b = ev.target.closest("button");
    if (!b) return;
    $("ms-title").value = b.textContent;
    if (b.textContent === "Started hormones" && !editing) {
      const first = D.firstDose(T.store);
      if (first && new Date($("entry-when").value) > new Date(first.at)) {
        $("entry-when").value = localInputValue(first.at);
        T.toast("Set to your first logged dose. Change it if you started earlier");
      }
    }
  });
  $("ms-ics").addEventListener("click", function () {
    if (!editing) return;
    const name = (editing.title || "Milestone") + " anniversary";
    T.download("milestone.ics", D.ics(editing, name), "text/calendar");
  });

  // Tapping a selected mood again clears it.
  $("mood-pills").addEventListener("pointerdown", function (ev) {
    const l = ev.target.closest("label");
    const input = l && l.querySelector("input");
    if (input) input.dataset.was = input.checked ? "1" : "";
  });
  $("mood-pills").addEventListener("click", function (ev) {
    if (ev.target.tagName !== "INPUT") return;
    if (ev.target.dataset.was === "1") ev.target.checked = false;
    ev.target.dataset.was = "";
  });

  $("entry-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const kind = document.querySelector('#entry-form input[name="kind"]:checked').value;
    const title = $("ms-title").value.trim();
    const text = $("entry-text").value.trim();
    if (kind === "milestone" && !title) { T.toast("Give your milestone a name"); $("ms-title").focus(); return; }
    if (kind === "journal" && !text && !draftPhotos.length && !document.querySelector('#mood-pills input:checked')) {
      T.toast("Write something, pick a mood, or add a photo");
      return;
    }
    const moodInput = document.querySelector('#mood-pills input:checked');
    const data = {
      kind: kind,
      title: kind === "milestone" ? title : "",
      at: new Date($("entry-when").value || Date.now()).toISOString(),
      text: text,
      mood: moodInput ? parseInt(moodInput.value, 10) : null,
      tags: Array.prototype.map.call(document.querySelectorAll("#tag-pills input:checked"), function (i) { return i.value; }),
      photos: draftPhotos
    };
    if (editing) Object.assign(editing, data);
    else entries.push(Object.assign({ id: "e" + T.uid() }, data));
    removedThisTime.forEach(deletePhotoBlobs);
    saved = true;
    save();
    $("entry-sheet").close();
    render();
    T.toast(editing ? "Saved" : (kind === "milestone" ? "Milestone added" : "Entry saved"));
    if (!editing && kind === "milestone") setTimeout(function () { D.confettiFrom($("ms-strip"), { count: 50 }); }, 200);
  });

  // Closing without saving drops any photos taken during this edit.
  $("entry-sheet").addEventListener("close", function () {
    if (!saved) addedThisTime.forEach(deletePhotoBlobs);
    addedThisTime = [];
    removedThisTime = [];
  });

  $("entry-delete").addEventListener("click", function () {
    const del = $("entry-delete");
    if (!del.dataset.armed) {
      del.dataset.armed = "1";
      del.textContent = (editing.photos || []).length ? "Also deletes its photos. Tap again" : "Tap again to delete";
      return;
    }
    (editing.photos || []).forEach(function (p) { deletePhotoBlobs(p.id); });
    entries = entries.filter(function (x) { return x !== editing; });
    saved = true;
    save();
    $("entry-sheet").close();
    render();
    T.toast("Entry deleted");
  });

  $("entry-gallery").addEventListener("change", async function () {
    const files = Array.prototype.slice.call(this.files || []);
    this.value = "";
    for (const f of files) {
      try {
        const id = await importFile(f);
        draftPhotos.push({ id: id, at: new Date().toISOString() });
        addedThisTime.push(id);
      } catch (e) { T.toast("One photo couldn’t be read"); }
    }
    renderDraftPhotos();
  });
  $("entry-camera").addEventListener("click", function () {
    openCamera(function (id) {
      draftPhotos.push({ id: id, at: new Date().toISOString() });
      addedThisTime.push(id);
      renderDraftPhotos();
    });
  });

  // ---------------- Camera ----------------
  let camStream = null, facing = "user", camDone = null, timerSecs = 0, ghostOn = true, counting = false;
  const video = $("cam-video"), ghost = $("cam-ghost");

  async function startStream() {
    stopStream();
    $("cam-msg").hidden = true;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false
      });
      video.srcObject = camStream;
      video.classList.toggle("mirror", facing === "user");
      ghost.classList.toggle("mirror", false);
      await video.play().catch(function () { /* autoplay muted */ });
    } catch (e) {
      $("cam-msg").hidden = false;
      $("cam-msg").textContent = e && e.name === "NotAllowedError"
        ? "Camera access is blocked. Allow the camera for Tendril in your browser settings, or choose a photo from your gallery."
        : "The camera isn’t available. You can choose a photo from your gallery instead.";
    }
  }
  function stopStream() {
    if (camStream) camStream.getTracks().forEach(function (t) { t.stop(); });
    camStream = null;
    video.srcObject = null;
  }

  function openCamera(done) {
    camDone = done;
    const last = allPhotos().slice(-1)[0];
    ghost.hidden = true;
    $("cam-ghost-btn").hidden = !last;
    if (last) {
      setImg(ghost, last.id, false);
      ghost.hidden = !ghostOn;
    }
    $("cam-ghost-btn").textContent = ghostOn ? "Outline on" : "Outline off";
    $("cam-ghost-btn").setAttribute("aria-pressed", ghostOn ? "true" : "false");
    $("camera").showModal();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) startStream();
    else { $("cam-msg").hidden = false; $("cam-msg").textContent = "This browser can’t open the camera here. Choose a photo from your gallery instead."; }
  }
  function closeCamera() {
    stopStream();
    counting = false;
    $("cam-count").hidden = true;
    if ($("camera").open) $("camera").close();
  }

  async function shoot() {
    if (!camStream || counting) return;
    if (timerSecs) {
      counting = true;
      for (let n = timerSecs; n > 0; n--) {
        if (!counting) return;
        $("cam-count").hidden = false;
        $("cam-count").textContent = n;
        await new Promise(function (r) { setTimeout(r, 1000); });
      }
      $("cam-count").hidden = true;
      if (!counting) return;
      counting = false;
    }
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    $("cam-stage").classList.add("flash");
    setTimeout(function () { $("cam-stage").classList.remove("flash"); }, 180);
    try {
      const id = await storePhoto(video, w, h, facing === "user");
      const done = camDone;
      closeCamera();
      if (done) done(id);
    } catch (e) {
      T.toast("Couldn’t save the photo");
    }
  }

  $("cam-shoot").addEventListener("click", shoot);
  $("cam-close").addEventListener("click", closeCamera);
  $("camera").addEventListener("cancel", function () { stopStream(); counting = false; });
  $("cam-flip").addEventListener("click", function () { facing = facing === "user" ? "environment" : "user"; startStream(); });
  $("cam-timer").addEventListener("click", function () {
    timerSecs = timerSecs === 0 ? 3 : timerSecs === 3 ? 10 : 0;
    $("cam-timer").textContent = timerSecs ? "Timer " + timerSecs + " s" : "Timer off";
  });
  $("cam-ghost-btn").addEventListener("click", function () {
    ghostOn = !ghostOn;
    ghost.hidden = !ghostOn;
    $("cam-ghost-btn").textContent = ghostOn ? "Outline on" : "Outline off";
    $("cam-ghost-btn").setAttribute("aria-pressed", ghostOn ? "true" : "false");
  });
  $("cam-file").addEventListener("change", async function () {
    const f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    try {
      const id = await importFile(f);
      const done = camDone;
      closeCamera();
      if (done) done(id);
    } catch (e) { T.toast("That photo couldn’t be read"); }
  });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") closeCamera(); });

  // ---------------- Viewer ----------------
  let viewIndex = 0;
  function openViewer(id) {
    const list = allPhotos();
    viewIndex = Math.max(0, list.findIndex(function (p) { return p.id === id; }));
    showViewer();
    $("viewer").showModal();
  }
  function showViewer() {
    const list = allPhotos();
    if (!list.length) { $("viewer").close(); return; }
    viewIndex = Math.min(Math.max(viewIndex, 0), list.length - 1);
    const p = list[viewIndex];
    setImg($("viewer-img"), p.id, false);
    $("viewer-date").textContent = new Date(p.at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) + " · " + sinceText(p.at) + (daysSince(p.at) > 0 ? " ago" : "");
    $("viewer-count").textContent = (viewIndex + 1) + " / " + list.length;
    $("viewer-prev").disabled = viewIndex === 0;
    $("viewer-next").disabled = viewIndex === list.length - 1;
    $("viewer-compare").hidden = list.length < 2;
    const del = $("viewer-delete");
    del.textContent = "Delete photo";
    delete del.dataset.armed;
  }
  $("viewer-prev").addEventListener("click", function () { viewIndex--; showViewer(); });
  $("viewer-next").addEventListener("click", function () { viewIndex++; showViewer(); });
  $("viewer").addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowLeft" && viewIndex > 0) { viewIndex--; showViewer(); }
    if (ev.key === "ArrowRight") { viewIndex++; showViewer(); }
  });
  // Swipe between photos.
  let touchX = null;
  $("viewer-img").addEventListener("touchstart", function (ev) { touchX = ev.touches[0].clientX; }, { passive: true });
  $("viewer-img").addEventListener("touchend", function (ev) {
    if (touchX == null) return;
    const dx = ev.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 50) return;
    viewIndex += dx < 0 ? 1 : -1;
    showViewer();
  });
  $("viewer-delete").addEventListener("click", function () {
    const del = $("viewer-delete");
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; return; }
    const p = allPhotos()[viewIndex];
    p.entry.photos = p.entry.photos.filter(function (q) { return q.id !== p.id; });
    deletePhotoBlobs(p.id);
    save();
    render();
    T.toast("Photo deleted");
    showViewer();
  });
  $("viewer-compare").addEventListener("click", function () {
    const list = allPhotos();
    const cur = list[viewIndex];
    $("viewer").close();
    const other = cur.id === list[0].id ? list[list.length - 1] : list[0];
    openCompare(other.at <= cur.at ? other.id : cur.id, other.at <= cur.at ? cur.id : other.id);
  });

  // ---------------- Compare ----------------
  let cmpA = null, cmpB = null;

  function openCompare(a, b) {
    const list = allPhotos();
    if (list.length < 2) return;
    cmpA = a || list[0].id;
    cmpB = b || list[list.length - 1].id;
    $("cmp-range").value = 50;
    applySplit();
    showCompare();
    $("compare").showModal();
  }
  function showCompare() {
    const list = allPhotos();
    const pa = list.find(function (p) { return p.id === cmpA; }) || list[0];
    const pb = list.find(function (p) { return p.id === cmpB; }) || list[list.length - 1];
    const dateA = new Date(pa.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    const dateB = new Date(pb.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    setImg($("cmp-a"), pa.id, false); setImg($("cmp-b"), pb.id, false);
    setImg($("cmp-a2"), pa.id, false); setImg($("cmp-b2"), pb.id, false);
    $("cmp-cap-a").textContent = dateA; $("cmp-cap-b").textContent = dateB;
    $("cmp-tag-a").textContent = dateA; $("cmp-tag-b").textContent = dateB;
    const gap = Math.abs(Math.round((dayStart(pb.at) - dayStart(pa.at)) / 86400000));
    $("cmp-gap").textContent = gap === 0 ? "Same day" : sinceText(new Date(Date.now() - gap * 86400000)) + " apart";
    renderPicker("pick-a", cmpA, function (id) { cmpA = id; showCompare(); });
    renderPicker("pick-b", cmpB, function (id) { cmpB = id; showCompare(); });
  }
  function renderPicker(hostId, current, onPick) {
    const host = $(hostId);
    host.innerHTML = "";
    allPhotos().forEach(function (p) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick" + (p.id === current ? " is-on" : "");
      b.setAttribute("aria-pressed", p.id === current ? "true" : "false");
      b.setAttribute("aria-label", "Photo from " + new Date(p.at).toLocaleDateString());
      const img = document.createElement("img");
      img.alt = "";
      setImg(img, p.id, true);
      b.appendChild(img);
      b.addEventListener("click", function () { onPick(p.id); });
      host.appendChild(b);
      if (p.id === current) setTimeout(function () { b.scrollIntoView({ block: "nearest", inline: "center" }); });
    });
  }
  function applySplit() {
    const v = $("cmp-range").value;
    $("cmp-a2").style.clipPath = "inset(0 " + (100 - v) + "% 0 0)";
    $("cmp-handle").style.left = v + "%";
  }
  $("cmp-range").addEventListener("input", applySplit);
  document.querySelectorAll('input[name="cmp-mode"]').forEach(function (r) {
    r.addEventListener("change", function () {
      const side = r.value === "side" && r.checked;
      $("cmp-side").hidden = !side;
      $("cmp-slider").hidden = side;
    });
  });
  $("open-compare").addEventListener("click", function () { openCompare(); });

  // ---------------- Wire up ----------------
  function newPhotoEntry() {
    openCamera(function (id) { openEntry(null, { photoId: id }); });
  }
  $("new-entry").addEventListener("click", function () { openEntry(null); });
  $("new-ms").addEventListener("click", function () { openEntry(null, { kind: "milestone" }); });
  $("new-photo").addEventListener("click", newPhotoEntry);
  $("empty-entry").addEventListener("click", function () { openEntry(null); });
  $("empty-photo").addEventListener("click", newPhotoEntry);
  $("filters").addEventListener("change", function (ev) { filter = ev.target.value; render(); });
  document.querySelectorAll("dialog [data-close]").forEach(function (b) {
    b.addEventListener("click", function () { b.closest("dialog").close(); });
  });
  document.querySelectorAll("dialog.sheet").forEach(function (d) {
    d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); });
  });

  render();

  // Opened from the home screen's "Compare" shortcut
  if (location.hash === "#compare" && allPhotos().length >= 2) {
    history.replaceState(null, "", location.pathname);
    openCompare();
  }
});
