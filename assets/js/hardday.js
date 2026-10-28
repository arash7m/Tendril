/* Tendril hard day mode: one calm page with small, optional things to do.
   Saved on this device: tendril:hardday.people, .words, .care, .region, .breath */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, D = window.TendrilDays;
  const $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  // ---------------- One section at a time ----------------
  let openId = null;
  function open(id) {
    if (openId && openId !== id) close();
    openId = id;
    document.querySelectorAll(".hd-tile").forEach(function (t) { t.setAttribute("aria-expanded", t.dataset.open === id ? "true" : "false"); });
    const sec = $("sec-" + id);
    sec.hidden = false;
    if (SECTIONS[id] && SECTIONS[id].open) SECTIONS[id].open();
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function close() {
    if (!openId) return;
    if (SECTIONS[openId] && SECTIONS[openId].close) SECTIONS[openId].close();
    $("sec-" + openId).hidden = true;
    document.querySelectorAll(".hd-tile").forEach(function (t) { t.setAttribute("aria-expanded", "false"); });
    openId = null;
  }
  document.querySelectorAll(".hd-tile").forEach(function (t) { t.addEventListener("click", function () { openId === t.dataset.open ? close() : open(t.dataset.open); }); });
  document.querySelectorAll("[data-close-sec]").forEach(function (b) {
    b.addEventListener("click", function () { close(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  });

  // ---------------- Breathe ----------------
  const PATTERNS = {
    calm: [["Breathe in", 4, 1], ["Breathe out", 6, 0]],
    box: [["Breathe in", 4, 1], ["Hold", 4, 1], ["Breathe out", 4, 0], ["Hold", 4, 0]]
  };
  let pattern = T.store.get("hardday.breath", "calm");
  if (!PATTERNS[pattern]) pattern = "calm";
  let breathing = false, bStart = 0, bRaf = 0, lastPhase = -1, breaths = 0;
  const ring = $("breath-ring"), word = $("breath-word");
  const canBuzz = typeof navigator.vibrate === "function";
  $("buzz-line").hidden = !canBuzz;
  $("breath-buzz").checked = !!T.store.get("hardday.buzz", false);
  $("breath-buzz").addEventListener("change", function () { T.store.set("hardday.buzz", $("breath-buzz").checked); });

  function showPattern() {
    document.querySelectorAll("[data-pattern]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.pattern === pattern ? "true" : "false"); });
  }
  document.querySelectorAll("[data-pattern]").forEach(function (b) {
    b.addEventListener("click", function () { pattern = b.dataset.pattern; T.store.set("hardday.breath", pattern); showPattern(); if (breathing) { stopBreath(); startBreath(); } });
  });

  function breathFrame(now) {
    if (!breathing) return;
    bRaf = requestAnimationFrame(breathFrame);
    const steps = PATTERNS[pattern];
    const cycle = steps.reduce(function (a, s) { return a + s[1]; }, 0);
    const t = ((now - bStart) / 1000) % cycle;
    let acc = 0, i = 0;
    while (i < steps.length - 1 && t >= acc + steps[i][1]) { acc += steps[i][1]; i++; }
    const s = steps[i], u = (t - acc) / s[1];
    // Size: grows while breathing in, stays on hold, shrinks while breathing out.
    const prev = steps[(i + steps.length - 1) % steps.length][2];
    let size;
    if (s[0] === "Breathe in") size = 0.5 - 0.5 * Math.cos(Math.PI * u);
    else if (s[0] === "Breathe out") size = 0.5 + 0.5 * Math.cos(Math.PI * u);
    else size = prev;
    ring.style.setProperty("--s", (0.55 + 0.45 * size).toFixed(3));
    if (i !== lastPhase) {
      if (lastPhase !== -1 && i === 0) breaths++;
      lastPhase = i;
      word.textContent = s[0];
      ring.dataset.phase = s[0] === "Hold" ? "hold" : s[2] ? "in" : "out";
      if (canBuzz && $("breath-buzz").checked) navigator.vibrate(s[0] === "Hold" ? 15 : 40);
      $("breath-count").textContent = breaths ? breaths + (breaths === 1 ? " breath" : " breaths") + ". Keep going as long as you like." : "Follow the circle. In through your nose if you can.";
    }
    const left = Math.ceil(s[1] - (t - acc));
    ring.dataset.count = left;
  }
  function startBreath() {
    breathing = true; breaths = 0; lastPhase = -1; bStart = performance.now();
    $("breath-go").textContent = "Stop";
    ring.classList.add("on");
    bRaf = requestAnimationFrame(breathFrame);
  }
  function stopBreath() {
    breathing = false;
    cancelAnimationFrame(bRaf);
    ring.classList.remove("on");
    ring.style.setProperty("--s", "0.55");
    word.textContent = breaths ? "Well done" : "Tap start";
    $("breath-go").textContent = "Start";
    if (breaths) $("breath-count").textContent = breaths + (breaths === 1 ? " slow breath" : " slow breaths") + ". Notice how your shoulders feel now.";
  }
  $("breath-go").addEventListener("click", function () { breathing ? stopBreath() : startBreath(); });
  showPattern();

  // ---------------- Ground: 5-4-3-2-1 ----------------
  const GROUND = [
    [5, "things you can see", "Look slowly around. A colour, a corner, something small you hadn’t noticed."],
    [4, "things you can touch", "Your clothes, the chair under you, your hair, something cool or soft."],
    [3, "things you can hear", "Near and far. Traffic, your breathing, a hum in the room."],
    [2, "things you can smell", "Or two smells you like, if nothing’s around. Coffee, rain, clean laundry."],
    [1, "thing you can taste", "Or take a sip of water and notice it."]
  ];
  let gi = 0;
  function showGround() {
    const dots = $("ground-dots");
    dots.innerHTML = "";
    GROUND.forEach(function (_, i) { dots.appendChild(el("span", i < gi ? "done" : i === gi ? "now" : "")); });
    $("ground-input").value = "";
    if (gi >= GROUND.length) {
      $("ground-n").textContent = "♡";
      $("ground-ask").textContent = "You’re here. You’re okay right now.";
      $("ground-hint").textContent = "Take one more slow breath before you move on.";
      $("ground-input").hidden = true;
      $("ground-next").hidden = true;
      $("ground-restart").hidden = false;
      return;
    }
    const g = GROUND[gi];
    $("ground-n").textContent = g[0];
    $("ground-ask").textContent = "Name " + g[0] + " " + g[1];
    $("ground-hint").textContent = g[2];
    $("ground-input").hidden = false;
    $("ground-next").hidden = false;
    $("ground-next").textContent = gi === GROUND.length - 1 ? "Done" : "Next";
    $("ground-restart").hidden = true;
  }
  $("ground-next").addEventListener("click", function () { gi++; showGround(); });
  $("ground-input").addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); gi++; showGround(); } });
  $("ground-restart").addEventListener("click", function () { gi = 0; showGround(); });

  // ---------------- Good things ----------------
  const AFFIRM = [
    "Hard days don’t erase the progress you’ve made.",
    "You are allowed to take up space exactly as you are.",
    "Feeling this much doesn’t mean you’re doing it wrong.",
    "You’ve gotten through every hard day so far. That’s a real record.",
    "Rest is not giving up. It’s how you keep going.",
    "Your gender is real, on good days and on bad ones.",
    "You don’t have to look a certain way to be who you are.",
    "The people who love you would want you to be gentle with yourself today.",
    "This feeling is heavy, and it will shift. Feelings move, even slowly.",
    "You are not a burden for needing help.",
    "Small steps still count. Today, surviving counts.",
    "There is no deadline on becoming yourself."
  ];
  let affirmPool = [], affirmLast = -1;
  function words() { return T.store.get("hardday.words", []); }
  function nextAffirm() {
    affirmPool = words().map(function (w) { return w.text; }).concat(AFFIRM);
    let i;
    do { i = Math.floor(Math.random() * affirmPool.length); } while (affirmPool.length > 1 && i === affirmLast);
    affirmLast = i;
    const q = $("affirm");
    q.textContent = affirmPool[i];
    q.classList.remove("fresh"); void q.offsetWidth; q.classList.add("fresh");
  }
  $("affirm-next").addEventListener("click", nextAffirm);

  function renderWords() {
    const list = $("words-list");
    list.innerHTML = "";
    words().forEach(function (w) {
      const li = el("li");
      li.appendChild(el("span", null, w.text));
      const x = el("button", "icon-btn", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Remove");
      x.addEventListener("click", function () { T.store.set("hardday.words", words().filter(function (o) { return o.id !== w.id; })); renderWords(); });
      li.appendChild(x);
      list.appendChild(li);
    });
  }
  $("words-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const t = $("words-input").value.trim();
    if (!t) return;
    T.store.set("hardday.words", words().concat([{ id: T.uid(), text: t }]));
    $("words-input").value = "";
    renderWords();
    T.toast("Saved");
  });

  let jarPool = [];
  function showJar() {
    const box = $("good-jar");
    box.innerHTML = "";
    if (!jarPool.length) {
      box.appendChild(el("p", "good-label", "From your jar"));
      box.appendChild(el("p", "muted", "Your jar is empty for now. On a better day, add a compliment or a small win; future you will be glad."));
      const a = el("a", "btn btn-soft btn-small", "Open the jar");
      a.href = "jar.html";
      box.appendChild(a);
      return;
    }
    const n = jarPool[Math.floor(Math.random() * jarPool.length)];
    box.appendChild(el("p", "good-label", "From your jar"));
    box.appendChild(el("blockquote", "jar-q", n.text));
    const meta = [n.from, new Date(n.at).toLocaleDateString(undefined, { month: "long", year: "numeric" })].filter(Boolean).join(" · ");
    box.appendChild(el("p", "small muted", meta));
    if (jarPool.length > 1) {
      const b = el("button", "btn btn-soft btn-small", "Another one");
      b.type = "button";
      b.addEventListener("click", showJar);
      box.appendChild(b);
    }
  }

  function showFacts() {
    const host = $("good-facts");
    host.innerHTML = "";
    const facts = [];
    const ms = D.milestones(T.store).filter(function (m) { return new Date(m.at) <= new Date(); });
    ms.slice(-3).reverse().forEach(function (m) {
      const n = D.diffDays(m.at, new Date());
      const len = n < 1 ? "today" : n < 60 ? n + (n === 1 ? " day" : " days") : n < 730 ? Math.floor(n / 30.44) + " months" : Math.floor(n / 365.25) + " years";
      facts.push([len, (m.title || "Milestone").replace(/^./, function (c) { return c.toUpperCase(); })]);
    });
    const warm = T.store.get("warmup.log", []).length, voice = T.store.get("voice.history", []).length + T.store.get("resonance.history", []).length + warm;
    if (voice) facts.push([String(voice), voice === 1 ? "voice practice session" : "voice practice sessions"]);
    const photos = T.store.get("timeline.entries", []).reduce(function (a, e) { return a + (e.photos || []).length; }, 0);
    if (photos >= 2) facts.push([String(photos), "photos of you becoming you"]);
    if (!facts.length) return;
    host.appendChild(el("p", "good-label", "Look how far you’ve come"));
    const g = el("div", "fact-grid");
    facts.forEach(function (f) { const d = el("div", "fact"); d.appendChild(el("span", "fact-n", f[0])); d.appendChild(el("span", "fact-t", f[1])); g.appendChild(d); });
    host.appendChild(g);
  }

  // ---------------- Reach out ----------------
  const LINES = {
    it: [["Gay Help Line", "800 713 713", "Free, for LGBT+ people including trans people. Mon–Sat, 16:00–20:00."]],
    uk: [["Switchboard LGBTQIA+", "0800 0119 100", "Free, every day 10:00–22:00."], ["Samaritans", "116 123", "Free, any time, day or night."]],
    ie: [["Samaritans", "116 123", "Free, any time, day or night."]],
    us: [["Trans Lifeline", "(877) 565-8860", "Peer support by trans people. Mon–Fri, 10am–6pm Pacific."], ["988 Suicide & Crisis Lifeline", "988", "Call or text, any time."], ["The Trevor Project", "(866) 488-7386", "For LGBTQ+ young people, any time. Or text START to 678678."]],
    ca: [["Trans Lifeline", "(877) 330-6366", "Peer support by trans people. Mon–Fri, 1pm–9pm Eastern."], ["9-8-8 Suicide Crisis Helpline", "988", "Call or text, any time."]],
    other: []
  };
  const EMERGENCY = { it: "112", uk: "999", ie: "112", us: "911", ca: "911", other: "" };
  function guessRegion() {
    const l = (navigator.language || "").toLowerCase();
    if (/^it/.test(l)) return "it";
    if (/-gb$/.test(l)) return "uk";
    if (/-ie$/.test(l)) return "ie";
    if (/-ca$/.test(l) || /^fr-ca/.test(l)) return "ca";
    if (/-us$/.test(l) || l === "en") return "us";
    return "other";
  }
  let region = T.store.get("hardday.region", null) || guessRegion();
  if (!LINES[region]) region = "other";
  $("region").value = region;
  $("region").addEventListener("change", function () { region = $("region").value; T.store.set("hardday.region", region); renderLines(); renderDanger(); });

  function telHref(num) { return "tel:" + num.replace(/[^\d+]/g, ""); }
  function renderLines() {
    const ul = $("lines");
    ul.innerHTML = "";
    LINES[region].forEach(function (l) {
      const li = el("li", "line");
      const info = el("div", "line-info");
      info.appendChild(el("strong", null, l[0]));
      info.appendChild(el("span", "small muted", l[2]));
      li.appendChild(info);
      const a = el("a", "btn btn-soft btn-small", l[1]);
      a.href = telHref(l[1]);
      a.setAttribute("aria-label", "Call " + l[0] + ", " + l[1]);
      li.appendChild(a);
      ul.appendChild(li);
    });
    if (!LINES[region].length) ul.appendChild(el("li", "line muted", "Find a free line where you are at findahelpline.com, linked below."));
  }
  function renderDanger() {
    const num = EMERGENCY[region];
    $("danger-call").hidden = !num;
    if (num) { $("danger-call").href = "tel:" + num; $("danger-call").textContent = "Call " + num; }
    $("danger-text").textContent = num ? "Please call emergency services now, or go to the nearest emergency department." : "Please call your local emergency number now, or go to the nearest emergency department.";
  }

  function people() { return T.store.get("hardday.people", []); }
  const MSGS = [
    "Hey, I’m having a really hard day. Could you call me when you get a moment?",
    "I don’t want to be alone right now. Could you come over, or stay on the phone with me?",
    "Today’s rough. Could you just talk to me about anything, to take my mind off it?",
    "I’m okay, but not great. Could you check in on me later?"
  ];
  function smsHref(phone, body) {
    // iOS uses "&body=", Android accepts "?body="; "?&body=" works on both.
    return "sms:" + (phone ? phone.replace(/[^\d+]/g, "") : "") + "?&body=" + encodeURIComponent(body);
  }
  let msgPick = 0;
  function renderPeople() {
    const ul = $("people");
    ul.innerHTML = "";
    const list = people();
    $("people-empty").hidden = list.length > 0;
    list.forEach(function (p) {
      const li = el("li", "person");
      li.appendChild(el("strong", "person-name", p.name));
      const acts = el("div", "row");
      const call = el("a", "btn btn-primary btn-small", "Call");
      call.href = telHref(p.phone);
      const text = el("a", "btn btn-soft btn-small", "Text");
      text.href = smsHref(p.phone, MSGS[msgPick]);
      text.title = "Opens your messages with the selected message";
      const del = el("button", "icon-btn", "×");
      del.type = "button";
      del.setAttribute("aria-label", "Remove " + p.name);
      del.addEventListener("click", function () {
        if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Remove?"; del.classList.add("armed"); return; }
        T.store.set("hardday.people", people().filter(function (o) { return o.id !== p.id; }));
        renderPeople();
      });
      acts.appendChild(call); acts.appendChild(text); acts.appendChild(del);
      li.appendChild(acts);
      ul.appendChild(li);
    });
  }
  function renderMsgs() {
    const ul = $("msgs");
    ul.innerHTML = "";
    MSGS.forEach(function (m, i) {
      const li = el("li", "msg" + (i === msgPick ? " is-on" : ""));
      const pick = el("button", "msg-text", m);
      pick.type = "button";
      pick.setAttribute("aria-pressed", i === msgPick ? "true" : "false");
      pick.addEventListener("click", function () { msgPick = i; renderMsgs(); renderPeople(); });
      li.appendChild(pick);
      const copy = el("button", "btn btn-soft btn-small", "Copy");
      copy.type = "button";
      copy.addEventListener("click", function () {
        (navigator.clipboard ? navigator.clipboard.writeText(m) : Promise.reject()).then(function () { T.toast("Copied"); }, function () { T.toast("Couldn’t copy. Press and hold the text instead"); });
      });
      li.appendChild(copy);
      ul.appendChild(li);
    });
  }
  $("person-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const name = $("person-name").value.trim(), phone = $("person-phone").value.trim();
    if (!name || !phone) return;
    T.store.set("hardday.people", people().concat([{ id: T.uid(), name: name, phone: phone }]));
    $("person-name").value = ""; $("person-phone").value = "";
    document.querySelector(".add-person").open = false;
    renderPeople();
    T.toast(name + " is saved");
  });

  // ---------------- Gentle care ----------------
  const CARE = [
    ["water", "Drink a glass of water"],
    ["food", "Eat something, even something small"],
    ["meds", "Take any medication that’s due"],
    ["air", "Open a window or step outside for a minute"],
    ["soft", "Wrap up in something soft or warm"],
    ["move", "Stretch, or shake out your hands and arms"],
    ["comfort", "Put on a comfort show, song or podcast"],
    ["wash", "Wash your face or take a warm shower"],
    ["rest", "Lie down for a bit. Rest is allowed"]
  ];
  function todayKey() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function careState() { const c = T.store.get("hardday.care", null); return c && c.day === todayKey() ? c : { day: todayKey(), done: [] }; }
  function renderCare() {
    const st = careState(), ul = $("care-list");
    ul.innerHTML = "";
    CARE.forEach(function (c) {
      const li = el("li");
      const lab = el("label", "care-item" + (st.done.indexOf(c[0]) >= 0 ? " done" : ""));
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = st.done.indexOf(c[0]) >= 0;
      cb.addEventListener("change", function () {
        const s = careState();
        s.done = s.done.filter(function (x) { return x !== c[0]; });
        if (cb.checked) s.done.push(c[0]);
        T.store.set("hardday.care", s);
        renderCare();
        if (cb.checked) T.toast(["That counts.", "Nice. One small thing done.", "Your body thanks you."][s.done.length % 3]);
      });
      lab.appendChild(cb);
      lab.appendChild(el("span", null, c[1]));
      li.appendChild(lab);
      ul.appendChild(li);
    });
    const n = st.done.length;
    $("care-done").hidden = n === 0;
    $("care-done").textContent = n >= 3 ? n + " things done today. You’re taking good care of yourself." : n + (n === 1 ? " thing" : " things") + " done today. That counts.";
  }

  // ---------------- Write it out ----------------
  $("write-go").addEventListener("click", function () {
    const ta = $("write-text");
    if (!ta.value.trim()) { T.toast("Write anything first, even one word"); return; }
    ta.classList.add("letting-go");
    ta.disabled = true;
    setTimeout(function () {
      ta.value = "";
      ta.classList.remove("letting-go");
      ta.disabled = false;
      T.toast("Gone. It doesn’t have to live in your head anymore.");
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 1600);
  });
  $("write-keep").addEventListener("click", function () {
    const text = $("write-text").value.trim();
    if (!text) { T.toast("Write anything first, even one word"); return; }
    const all = T.store.get("timeline.entries", []);
    all.push({ id: "e" + T.uid(), kind: "journal", title: "", at: new Date().toISOString(), text: text, mood: null, tags: [], photos: [] });
    T.store.set("timeline.entries", all);
    $("write-text").value = "";
    T.toast("Kept in your timeline");
  });

  const SECTIONS = {
    breathe: { close: function () { if (breathing) stopBreath(); } },
    ground: { open: function () { gi = 0; showGround(); } },
    good: {
      open: function () {
        jarPool = T.store.get("jar.notes", []).map(function (n) { return { text: n.text, from: n.from, at: n.at }; })
          .concat(T.store.get("timeline.entries", []).filter(function (e) { return (e.tags || []).indexOf("euphoria") >= 0 && e.text; })
            .map(function (e) { return { text: e.text, at: e.at }; }));
        showJar(); showFacts(); nextAffirm(); renderWords();
      }
    },
    reach: { open: function () { renderPeople(); renderMsgs(); renderLines(); } },
    care: { open: renderCare }
  };

  renderDanger();
  const h = location.hash.slice(1);
  if (SECTIONS[h] || $("sec-" + h)) { history.replaceState(null, "", location.pathname); open(h); }
});
