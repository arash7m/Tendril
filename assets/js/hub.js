/* Tendril home hub: a glanceable overview once someone is using the app.
   First-time visitors see the welcome page instead. Settings: tendril:hub.settings */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, V = window.TendrilVisits, L = window.TendrilLabs;
  const $ = function (id) { return document.getElementById(id); };

  const CARDS = [
    { id: "next", label: "Up next: doses", sensitive: true },
    { id: "voice", label: "Voice practice", sensitive: false },
    { id: "milestone", label: "Milestone", sensitive: true },
    { id: "checkin", label: "Mood check-in", sensitive: false },
    { id: "visit", label: "Next appointment", sensitive: true },
    { id: "photos", label: "Progress photos", sensitive: true },
    { id: "labs", label: "Lab results", sensitive: true },
    { id: "jar", label: "From your jar", sensitive: true },
    { id: "links", label: "All tools", sensitive: false }
  ];
  const MOODS = { 1: "Rough", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };
  const KIND = { injection: "Injection", pill: "Pill", patch: "Patch", gel: "Gel", other: "Other" };

  let settings = T.store.get("hub.settings", {});
  // Once: Voice moved up to where Next appointment used to be, for anyone with a saved order.
  if (!settings.voiceUp) {
    if (Array.isArray(settings.order)) {
      const o = settings.order, v = o.indexOf("voice"), a = o.indexOf("visit");
      if (v > a && a >= 0) { o[a] = "voice"; o[v] = "visit"; }
    }
    settings.voiceUp = true;
    if (T.store.get("hub.settings", null)) T.store.set("hub.settings", settings);
  }
  const revealed = {}; // cards uncovered this visit while discreet mode is on

  // ---------------- Welcome or hub? ----------------
  function inUse() {
    if (settings.forceHub) return true;
    return T.store.keys().some(function (k) {
      if (k.indexOf("hub.") === 0) return false;
      const v = T.store.get(k, null);
      if (Array.isArray(v)) return v.length > 0;
      return v && typeof v === "object" ? Object.keys(v).length > 0 : v != null;
    });
  }

  // ---------------- Helpers ----------------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(href, text, cls) { const a = el("a", cls || "hub-link", text); a.href = href; return a; }
  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function daysSince(d) { return Math.round((dayStart(new Date()) - dayStart(d)) / 86400000); }
  function sinceText(d) {
    const n = daysSince(d);
    if (n <= 0) return n === 0 ? "Today" : "In " + (-n) + " days";
    if (n < 60) return n + (n === 1 ? " day" : " days");
    if (n < 730) return Math.floor(n / 30.44) + " months";
    const y = Math.floor(n / 365.25), m = Math.floor((n - y * 365.25) / 30.44);
    return y + (y === 1 ? " year" : " years") + (m ? " " + m + " mo" : "");
  }
  function orderedCards() {
    const order = (settings.order || []).filter(function (id) { return CARDS.some(function (c) { return c.id === id; }); });
    CARDS.forEach(function (c) { if (order.indexOf(c.id) < 0) order.push(c.id); });
    return order.map(function (id) { return CARDS.find(function (c) { return c.id === id; }); });
  }

  // ---------------- Greeting ----------------
  function greetingName() {
    if (settings.name != null) return settings.name;
    const s = T.store.get("names.shortlist", [])[0];
    return s ? s.name : "";
  }
  function renderGreeting() {
    const h = new Date().getHours();
    const hello = h < 5 ? "Hey, night owl" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const name = greetingName();
    const g = $("hub-hello");
    g.textContent = "";
    g.appendChild(document.createTextNode(hello + (name ? ", " : "")));
    if (name) g.appendChild(el("span", "hub-name", name));
    $("hub-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const d = $("discreet-toggle");
    d.setAttribute("aria-pressed", settings.discreet ? "true" : "false");
    d.title = settings.discreet ? "Discreet mode is on" : "Discreet mode is off";
  }

  // ---------------- Cards ----------------
  function frame(c, title, href) {
    const card = el("section", "hub-card hub-" + c.id);
    card.setAttribute("aria-label", title);
    const head = el("div", "hc-head");
    head.appendChild(el("h2", "hc-title", title));
    if (href) head.appendChild(link(href, "Open", "hc-open"));
    card.appendChild(head);
    const body = el("div", "hc-body");
    card.appendChild(body);
    if (settings.discreet && c.sensitive && !revealed[c.id]) {
      card.classList.add("is-covered");
      const cover = el("button", "hc-cover");
      cover.type = "button";
      cover.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/></svg><span>Tap to show</span>';
      cover.addEventListener("click", function () { revealed[c.id] = true; render(); });
      card.appendChild(cover);
    }
    return { card: card, body: body };
  }

  function emptyLine(body, text, href, cta) {
    body.appendChild(el("p", "hc-empty", text));
    body.appendChild(link(href, cta, "btn btn-soft btn-small"));
  }

  // Up next: doses
  function cardNext(c) {
    const f = frame(c, "Up next", "doses.html");
    const meds = T.store.get("doses.meds", []), log = T.store.get("doses.log", []);
    if (!meds.length) { emptyLine(f.body, "Track your injections, pills, patches or gel.", "doses.html", "Add a medication"); return f.card; }
    const rows = meds.map(function (m) {
      const mine = log.filter(function (e) { return e.medId === m.id; }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
      const due = mine[0] ? new Date(new Date(mine[0].at).getTime() + m.everyDays * 86400000) : null;
      return { m: m, due: due, diff: due ? Math.round((dayStart(due) - dayStart(new Date())) / 86400000) : -999 };
    }).sort(function (a, b) { return a.diff - b.diff; });
    const list = el("ul", "dose-list");
    rows.slice(0, 3).forEach(function (r) {
      const li = el("li", "dose-row");
      const info = el("div", "dose-info");
      info.appendChild(el("strong", null, r.m.name));
      const state = !r.due ? "Not logged yet" : r.diff < 0 ? "Overdue" : r.diff === 0 ? "Due today" : r.diff === 1 ? "Tomorrow" : "In " + r.diff + " days";
      const chip = el("span", "dose-chip", state);
      chip.dataset.state = !r.due ? "none" : r.diff < 0 ? "late" : r.diff === 0 ? "today" : "soon";
      info.appendChild(chip);
      li.appendChild(info);
      if (r.diff <= 1) {
        const needsSite = r.m.sites && r.m.sites.length;
        if (needsSite) li.appendChild(link("doses.html?log=" + encodeURIComponent(r.m.id), "Log", "btn btn-primary btn-small"));
        else {
          const b = el("button", "btn btn-primary btn-small", "Log");
          b.type = "button";
          b.addEventListener("click", function () {
            const all = T.store.get("doses.log", []);
            all.push({ id: T.uid(), medId: r.m.id, at: new Date().toISOString(), site: null, note: "" });
            T.store.set("doses.log", all);
            const ms = T.store.get("doses.meds", []);
            const mm = ms.find(function (x) { return x.id === r.m.id; });
            if (mm && mm.supply != null && mm.supply > 0) { mm.supply -= 1; T.store.set("doses.meds", ms); }
            T.toast("Logged " + r.m.name);
            render();
          });
          li.appendChild(b);
        }
      }
      list.appendChild(li);
    });
    f.body.appendChild(list);
    const low = meds.filter(function (m) { return m.supply != null && m.supply * m.everyDays <= 10; });
    if (low.length) f.body.appendChild(el("p", "hc-warn", (low.length === 1 ? low[0].name + " is" : low.length + " medications are") + " running low. Time to refill."));
    return f.card;
  }

  // Next appointment
  function cardVisit(c) {
    const f = frame(c, "Next appointment", "visits.html");
    const next = V.upcoming(T.store)[0];
    // A recent blood test without results logged after it
    const recentBlood = V.past(T.store).find(function (v) { return v.kind === "blood" && V.dayDiff(v) >= -21; });
    const tests = T.store.get("labs.tests", []);
    const needsResults = recentBlood && !tests.some(function (t) { return t.date >= recentBlood.date; });
    if (!next) {
      if (needsResults) {
        f.body.appendChild(el("p", "hc-big-sm", "Blood test " + V.countdown(recentBlood).toLowerCase()));
        f.body.appendChild(link("labs.html", "Add your results", "btn btn-primary btn-small"));
        return f.card;
      }
      emptyLine(f.body, "Nothing scheduled.", "visits.html", "Add an appointment");
      return f.card;
    }
    f.body.appendChild(el("p", "hc-big", V.countdown(next)));
    f.body.appendChild(el("p", "hc-sub", V.title(next) + " · " + new Date(next.date + "T12:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })));
    if (next.kind === "doctor" || next.kind === "blood") f.body.appendChild(link("summary.html", "Prepare your summary", "hub-link"));
    if (needsResults) f.body.appendChild(link("labs.html", "Add results from your last blood test", "hub-link"));
    return f.card;
  }

  // Mood check-in
  function cardCheckin(c) {
    const f = frame(c, "How are you right now?", null);
    const entries = T.store.get("timeline.entries", []);
    const today = entries.filter(function (e) { return e.mood && daysSince(e.at) === 0; }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); })[0];
    const row = el("div", "mood-row");
    [1, 2, 3, 4, 5].forEach(function (m) {
      const b = el("button", "mood-btn", MOODS[m]);
      b.type = "button";
      b.dataset.mood = m;
      if (today && today.mood === m) b.setAttribute("aria-pressed", "true");
      b.addEventListener("click", function () {
        const all = T.store.get("timeline.entries", []);
        all.push({ id: "e" + T.uid(), kind: "journal", title: "", at: new Date().toISOString(), text: "", mood: m, tags: [], photos: [] });
        T.store.set("timeline.entries", all);
        T.toast("Saved to your timeline");
        render();
      });
      row.appendChild(b);
    });
    f.body.appendChild(row);
    f.body.appendChild(today
      ? link("timeline.html", "Today you said " + MOODS[today.mood].toLowerCase() + ". Add a note in your timeline", "hub-link")
      : el("p", "hc-sub", "One tap saves it to your timeline."));
    if (today && today.mood <= 2) {
      const soft = el("div", "hc-soft");
      soft.appendChild(el("span", null, "Sorry today feels heavy."));
      soft.appendChild(link("hardday.html", "Open hard day mode", "btn btn-soft btn-small"));
      f.body.appendChild(soft);
    }
    return f.card;
  }

  // Milestone and anniversaries
  let cheered = false;
  function cardMilestone(c) {
    const D = window.TendrilDays;
    const ms = D.milestones(T.store);
    const todays = D.today(ms);
    const f = frame(c, todays.length ? "Big day" : "Milestone", "timeline.html");
    if (!ms.length) { emptyLine(f.body, "Mark a day that matters, like starting hormones.", "timeline.html", "Add a milestone"); return f.card; }
    const dateText = function (d) { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); };

    if (todays.length) {
      const top = todays[0];
      f.card.classList.add("is-anniv");
      f.body.appendChild(el("p", "hc-cheer", "Happy anniversary!"));
      f.body.appendChild(el("p", "hc-big", top.label));
      f.body.appendChild(el("p", "hc-ms-title", top.ms.title || "Milestone"));
      f.body.appendChild(el("p", "hc-sub", "Since " + dateText(top.ms.at) + (todays.length > 1 ? " · and " + (todays.length - 1) + " more today" : "")));
      const again = el("button", "hub-link", "Celebrate again");
      again.type = "button";
      again.addEventListener("click", function () { D.confettiFrom(f.card, { count: 80, stagger: 0.4 }); });
      f.body.appendChild(again);
      const covered = f.card.classList.contains("is-covered");
      if (!cheered && !covered) {
        cheered = true;
        const fresh = todays.filter(function (o) { return D.firstTimeToday(T.store, o); }).length > 0;
        if (fresh) setTimeout(function () { if (f.card.isConnected) D.confettiFrom(f.card, { count: 80, stagger: 0.4 }); }, 600);
      }
      return f.card;
    }

    // Show the day hormones started if there is one, otherwise the first milestone.
    const pick = D.hrtMilestone(ms) || ms[0];
    f.body.appendChild(el("p", "hc-big", sinceText(pick.at)));
    f.body.appendChild(el("p", "hc-ms-title", pick.title || "Milestone"));
    f.body.appendChild(el("p", "hc-sub", (daysSince(pick.at) >= 0 ? "Since " : "On ") + dateText(pick.at)));
    const soon = D.upcoming(ms, 45)[0];
    if (soon) {
      f.body.appendChild(el("p", "hc-soon", soon.label + (soon.ms === pick ? "" : " · " + (soon.ms.title || "Milestone")) + " " + D.inText(soon.inDays)));
    }
    return f.card;
  }

  // Progress photos
  function cardPhotos(c) {
    const f = frame(c, "Progress photos", "timeline.html");
    const photos = [];
    T.store.get("timeline.entries", []).forEach(function (e) { (e.photos || []).forEach(function (p) { photos.push({ id: p.id, at: e.at }); }); });
    photos.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    if (!photos.length) { emptyLine(f.body, "Photos taken in Tendril stay out of your gallery.", "timeline.html", "Take a first photo"); return f.card; }
    const latest = photos[0];
    const wrap = el("div", "photo-wrap");
    const frameEl = el("div", "hub-photo");
    frameEl.setAttribute("role", "img");
    frameEl.setAttribute("aria-label", "Your latest progress photo");
    T.photos.get(latest.id + ":thumb").then(function (b) { return b || T.photos.get(latest.id); })
      .then(function (b) {
        if (!b) return;
        const img = el("img");
        img.alt = "";
        img.src = URL.createObjectURL(b);
        frameEl.appendChild(img);
      }).catch(function () { /* locked or missing */ });
    wrap.appendChild(frameEl);
    const meta = el("div", "photo-meta");
    const n = daysSince(latest.at);
    meta.appendChild(el("p", "hc-sub", n === 0 ? "Latest photo: today" : "Latest photo: " + n + (n === 1 ? " day ago" : " days ago")));
    meta.appendChild(el("p", "hc-sub", photos.length + (photos.length === 1 ? " photo so far" : " photos so far")));
    if (photos.length > 1) meta.appendChild(link("timeline.html#compare", "Compare", "btn btn-soft btn-small"));
    wrap.appendChild(meta);
    f.body.appendChild(wrap);
    return f.card;
  }

  // Voice practice this week
  function cardVoice(c) {
    const f = frame(c, "Voice", "voice.html");
    const pitch = T.store.get("voice.history", []), res = T.store.get("resonance.history", []);
    const plays = T.store.get("games.plays", []), warm = T.store.get("warmup.log", []);
    if (!pitch.length && !res.length && !plays.length && !warm.length) {
      emptyLine(f.body, "A guided five-minute warm-up is a gentle way to start.", "warmup.html", "Start a warm-up");
      return f.card;
    }
    const week = el("div", "week-dots");
    const start = dayStart(new Date());
    start.setDate(start.getDate() - 6);
    let practiced = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const hit = pitch.concat(res, plays, warm).some(function (h) { return dayStart(h.at).getTime() === d.getTime(); });
      if (hit) practiced++;
      const dot = el("span", "week-dot" + (hit ? " on" : ""));
      dot.title = d.toLocaleDateString(undefined, { weekday: "long" });
      dot.appendChild(el("span", "wd-l", d.toLocaleDateString(undefined, { weekday: "narrow" })));
      week.appendChild(dot);
    }
    f.body.appendChild(week);
    f.body.appendChild(el("p", "hc-sub", practiced ? "Practiced " + practiced + (practiced === 1 ? " day" : " days") + " this week" : "A few minutes today would be nice"));
    // Warm-up streak and button
    const days = {};
    warm.forEach(function (w) { days[dayStart(w.at).getTime()] = true; });
    const today = dayStart(new Date());
    const doneToday = !!days[today.getTime()];
    let streak = 0;
    const d = new Date(today);
    if (!doneToday) d.setDate(d.getDate() - 1);
    while (days[dayStart(d).getTime()]) { streak++; d.setDate(d.getDate() - 1); }
    const row = el("div", "warm-row");
    if (streak) row.appendChild(el("span", "warm-streak" + (doneToday ? " done" : ""), streak + "-day streak"));
    if (doneToday) row.appendChild(el("span", "warm-done", "Warm-up done ✓"));
    else row.appendChild(link("warmup.html", streak ? "Keep it going: warm up" : "Start today’s warm-up", "btn btn-primary btn-small"));
    f.body.appendChild(row);
    const stats = el("div", "voice-stats");
    if (pitch[0]) stats.appendChild(el("span", null, "Pitch " + pitch[0].avg + " Hz"));
    if (res[0]) stats.appendChild(el("span", null, "Resonance " + res[0].avg));
    f.body.appendChild(stats);
    return f.card;
  }

  // From your jar
  function cardJar(c) {
    const f = frame(c, "From your jar", "jar.html");
    const pool = T.store.get("jar.notes", []).map(function (n) { return { text: n.text, from: n.from, at: n.at }; })
      .concat(T.store.get("timeline.entries", []).filter(function (e) { return (e.tags || []).indexOf("euphoria") >= 0 && e.text; })
        .map(function (e) { return { text: e.text, at: e.at }; }));
    if (!pool.length) { emptyLine(f.body, "Save compliments and good moments for hard days.", "jar.html", "Add a moment"); return f.card; }
    const show = function () {
      const n = pool[Math.floor(Math.random() * pool.length)];
      f.body.innerHTML = "";
      f.body.appendChild(el("blockquote", "jar-quote", n.text));
      f.body.appendChild(el("p", "hc-sub", [n.from, new Date(n.at).toLocaleDateString(undefined, { month: "long", year: "numeric" })].filter(Boolean).join(" · ")));
      if (pool.length > 1) {
        const b = el("button", "hub-link", "Another one");
        b.type = "button";
        b.addEventListener("click", show);
        f.body.appendChild(b);
      }
    };
    show();
    return f.card;
  }

  // Lab results
  function cardLabs(c) {
    const f = frame(c, "Lab results", "labs.html");
    const tests = T.store.get("labs.tests", []);
    const keys = [];
    tests.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (t) {
      (t.results || []).forEach(function (r) { if (keys.indexOf(r.m) < 0 && L.MARKERS[r.m]) keys.push(r.m); });
    });
    if (!keys.length) { emptyLine(f.body, "Chart your blood tests over time.", "labs.html", "Add results"); return f.card; }
    const list = el("ul", "lab-list");
    keys.slice(0, 3).forEach(function (k) {
      const s = L.series(tests, k), last = s[s.length - 1], prev = s.length > 1 ? s[s.length - 2] : null;
      const li = el("li");
      li.appendChild(el("span", "lab-n", L.MARKERS[k].name.replace(" (total)", "")));
      let arrow = "";
      if (prev) {
        const p = L.convert(k, prev.v, prev.u, last.u);
        if (p != null) arrow = last.v > p ? " ↑" : last.v < p ? " ↓" : " =";
      }
      li.appendChild(el("span", "lab-v", L.fmt(last.v) + " " + last.u + arrow));
      list.appendChild(li);
    });
    f.body.appendChild(list);
    return f.card;
  }

  // All tools
  function cardLinks(c) {
    const f = frame(c, "All tools", null);
    const tools = [
      ["timeline.html", "Timeline"], ["body.html", "Body"], ["voice.html", "Voice"], ["doses.html", "Doses"], ["labs.html", "Labs"],
      ["visits.html", "Appointments"], ["jar.html", "Jar"], ["names.html", "Names"], ["guides.html", "Guides"],
      ["comingout.html", "Coming out"], ["hardday.html", "Hard day"], ["data.html", "Your data"]
    ];
    const g = el("div", "tool-links");
    tools.forEach(function (t) { g.appendChild(link(t[0], t[1], "tool-link")); });
    f.body.appendChild(g);
    return f.card;
  }

  const BUILD = { next: cardNext, visit: cardVisit, checkin: cardCheckin, milestone: cardMilestone, photos: cardPhotos, voice: cardVoice, jar: cardJar, labs: cardLabs, links: cardLinks };

  function render() {
    renderGreeting();
    const grid = $("hub-grid");
    grid.innerHTML = "";
    const hidden = settings.hidden || [];
    orderedCards().forEach(function (c) {
      if (hidden.indexOf(c.id) >= 0) return;
      try { grid.appendChild(BUILD[c.id](c)); } catch (e) { /* one broken card shouldn't break the hub */ }
    });
  }

  // ---------------- Settings ----------------
  function saveSettings() { T.store.set("hub.settings", settings); }

  // The hard day heart says "Hard day?" for a few seconds on the first visits.
  (function () {
    const fab = $("hard-fab");
    if (!fab) return;
    const n = settings.fabSeen || 0;
    if (n < 4) {
      fab.classList.add("show-label");
      setTimeout(function () { fab.classList.remove("show-label"); }, 3500);
      settings.fabSeen = n + 1;
      if (inUse()) saveSettings();
    }
    fab.addEventListener("mouseenter", function () { fab.classList.add("show-label"); });
    fab.addEventListener("mouseleave", function () { fab.classList.remove("show-label"); });
    fab.addEventListener("focus", function () { fab.classList.add("show-label"); });
    fab.addEventListener("blur", function () { fab.classList.remove("show-label"); });
  })();

  function renderSettings() {
    $("hub-name-input").value = greetingName();
    $("hub-discreet").checked = !!settings.discreet;
    const list = $("card-order");
    list.innerHTML = "";
    const hidden = settings.hidden || [];
    orderedCards().forEach(function (c, i, arr) {
      const li = el("li", "order-row");
      const lab = el("label", "order-check");
      const box = el("input");
      box.type = "checkbox";
      box.checked = hidden.indexOf(c.id) < 0;
      box.addEventListener("change", function () {
        const h = (settings.hidden || []).filter(function (x) { return x !== c.id; });
        if (!box.checked) h.push(c.id);
        settings.hidden = h;
        saveSettings();
        render();
      });
      lab.appendChild(box);
      lab.appendChild(el("span", null, c.label));
      li.appendChild(lab);
      const move = function (dir, text, aria) {
        const b = el("button", "icon-btn", text);
        b.type = "button";
        b.setAttribute("aria-label", aria + " " + c.label);
        b.disabled = (dir < 0 && i === 0) || (dir > 0 && i === arr.length - 1);
        b.addEventListener("click", function () {
          const ids = arr.map(function (x) { return x.id; });
          const j = i + dir;
          ids[i] = ids[j]; ids[j] = c.id;
          settings.order = ids;
          saveSettings();
          renderSettings();
          render();
        });
        li.appendChild(b);
      };
      move(-1, "↑", "Move up");
      move(1, "↓", "Move down");
      list.appendChild(li);
    });
  }

  $("hub-settings-btn").addEventListener("click", function () { renderSettings(); $("hub-sheet").showModal(); });
  $("hub-name-input").addEventListener("input", function () { settings.name = $("hub-name-input").value.trim(); saveSettings(); renderGreeting(); });
  $("hub-discreet").addEventListener("change", function () { settings.discreet = $("hub-discreet").checked; saveSettings(); render(); });
  $("hub-reset").addEventListener("click", function () {
    settings = { name: settings.name, discreet: settings.discreet };
    saveSettings();
    renderSettings();
    render();
  });
  $("discreet-toggle").addEventListener("click", function () {
    settings.discreet = !settings.discreet;
    Object.keys(revealed).forEach(function (k) { delete revealed[k]; });
    saveSettings();
    render();
    T.toast(settings.discreet ? "Discreet mode on: cards are covered until you tap them" : "Discreet mode off");
  });
  document.querySelectorAll("#hub-sheet [data-close]").forEach(function (b) {
    b.addEventListener("click", function () { $("hub-sheet").close(); });
  });
  $("hub-sheet").addEventListener("click", function (ev) { if (ev.target === $("hub-sheet")) $("hub-sheet").close(); });
  // Cover everything again when coming back to the app.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && settings.discreet && Object.keys(revealed).length) {
      Object.keys(revealed).forEach(function (k) { delete revealed[k]; });
      render();
    }
  });
  $("open-hub").addEventListener("click", function () { settings.forceHub = true; saveSettings(); show(); });

  // ---------------- Show the right page ----------------
  function show() {
    const hub = inUse();
    document.documentElement.classList.toggle("hub-mode", hub);
    $("hub").hidden = !hub;
    $("welcome").hidden = hub;
    $("about").open = !hub;
    if (hub) render();
  }
  show();
});
