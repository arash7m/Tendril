/* Tendril name & pronoun sandbox. Only the shortlist is saved (tendril:names.shortlist). */
(function () {
  "use strict";

  const T = window.Tendril;
  const $ = function (id) { return document.getElementById(id); };

  const SETS = {
    she:  { label: "she/her",   sub: "she",  obj: "her",  det: "her",   pos: "hers",   ref: "herself",  plural: false },
    he:   { label: "he/him",    sub: "he",   obj: "him",  det: "his",   pos: "his",    ref: "himself",  plural: false },
    they: { label: "they/them", sub: "they", obj: "them", det: "their", pos: "theirs", ref: "themself", plural: true },
    xe:   { label: "xe/xem",    sub: "xe",   obj: "xem",  det: "xyr",   pos: "xyrs",   ref: "xemself",  plural: false },
    ze:   { label: "ze/hir",    sub: "ze",   obj: "hir",  det: "hir",   pos: "hirs",   ref: "hirself",  plural: false },
    it:   { label: "it/its",    sub: "it",   obj: "it",   det: "its",   pos: "its",    ref: "itself",   plural: false },
    custom: { label: "Other…" }
  };

  // {N} name · {s} subject · {S} Subject · {o} object · {d} possessive · {p} possessive alone · {r} reflexive
  // [singular|plural] picks the verb form that matches the pronoun.
  const TEMPLATES = [
    "{N} said {s} [is|are] running a little late, so let’s save {o} a seat.",
    "Have you met {N}? {S} just moved here and [is|are] really funny.",
    "That’s {d} jacket on the chair. I’ll give it back to {o} later.",
    "{N} fixed the bike {r}. Honestly, {s} [is|are] so handy.",
    "Is this coffee {p}? I think {N} left it here.",
    "I asked {N} about the trip, and {s} [loves|love] the idea.",
    "Happy birthday, {N}! We’re all so glad to know you.",
    "I’ve known {N} for years. {S} always [makes|make] me laugh.",
    "Can you tell {N} the meeting moved? {S} [was|were] asking about it earlier.",
    "Good morning, {N}! Did you sleep well?",
    "Excuse me, is {N} here? I have a package for {o}.",
    "{N} brought {d} famous lemon cake again. {S} really outdid {r}.",
    "Thanks, {N}. I couldn’t have done it without {o}.",
    "{S} [doesn’t|don’t] like crowds, so {N} and I went somewhere quiet.",
    "Ask {N}, {s} [knows|know] the best place for pizza around here.",
    "Our new colleague is {N}. Please make {o} feel welcome."
  ];
  const SHOW = 6;

  let setKey = "they";
  let order = shuffled();

  function shuffled() {
    const idx = TEMPLATES.map(function (_, i) { return i; });
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return idx;
  }

  function currentSet() {
    if (setKey !== "custom") return SETS[setKey];
    const v = function (id, fb) { return ($(id).value.trim() || fb).toLowerCase(); };
    const sub = v("c-sub", "fae"), obj = v("c-obj", "faer");
    return {
      label: sub + "/" + obj,
      sub: sub, obj: obj, det: v("c-det", "faer"), pos: v("c-pos", "faers"), ref: v("c-ref", "faerself"),
      plural: $("c-plural").checked
    };
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /** Fill a template, returning DOM nodes with the name and pronouns highlighted. */
  function fill(tpl, name, set) {
    const frag = document.createDocumentFragment();
    const re = /\{([NsSodpr])\}|\[([^|\]]+)\|([^\]]+)\]/g;
    let last = 0, m;
    while ((m = re.exec(tpl))) {
      if (m.index > last) frag.appendChild(document.createTextNode(tpl.slice(last, m.index)));
      if (m[1]) {
        let word, cls = "pr";
        switch (m[1]) {
          case "N": word = name; cls = "nm"; break;
          case "s": word = set.sub; break;
          case "S": word = cap(set.sub); break;
          case "o": word = set.obj; break;
          case "d": word = set.det; break;
          case "p": word = set.pos; break;
          case "r": word = set.ref; break;
        }
        // Capitalize at the start of a sentence.
        if (m.index === 0) word = cap(word);
        const span = document.createElement("mark");
        span.className = cls;
        span.textContent = word;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(set.plural ? m[3] : m[2]));
      }
      last = re.lastIndex;
    }
    if (last < tpl.length) frag.appendChild(document.createTextNode(tpl.slice(last)));
    return frag;
  }

  const canSpeak = "speechSynthesis" in window;

  function render() {
    const typed = $("name").value.trim();
    const name = typed || "Robin";
    const set = currentSet();
    $("hello-label").textContent = typed ? "Trying" : "Example";
    $("hello-name").textContent = name;
    $("hello-pron").textContent = "My pronouns are " + set.sub + "/" + set.obj + ".";
    $("custom-pronouns").hidden = setKey !== "custom";

    const list = $("sentences");
    list.innerHTML = "";
    order.slice(0, SHOW).forEach(function (i) {
      const li = document.createElement("li");
      const p = document.createElement("p");
      p.appendChild(fill(TEMPLATES[i], name, set));
      li.appendChild(p);
      if (canSpeak) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "speak";
        b.setAttribute("aria-label", "Read this sentence aloud");
        b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
        b.addEventListener("click", function () {
          try {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(p.textContent));
          } catch (e) { T.toast("Your device couldn’t read this aloud"); }
        });
        li.appendChild(b);
      }
      list.appendChild(li);
    });
    $("speak-note").hidden = !canSpeak;
  }

  // ---------------- Pronoun pills ----------------
  function renderPills() {
    const host = $("pronoun-pills");
    host.innerHTML = "";
    Object.keys(SETS).forEach(function (k) {
      const label = document.createElement("label");
      label.innerHTML = '<input type="radio" name="pron"><span></span>';
      const input = label.querySelector("input");
      input.value = k;
      input.checked = k === setKey;
      input.addEventListener("change", function () { setKey = k; render(); });
      label.querySelector("span").textContent = SETS[k].label;
      host.appendChild(label);
    });
  }

  // ---------------- Shortlist ----------------
  function getList() { return T.store.get("names.shortlist", []); }

  function renderShortlist() {
    const list = getList();
    const ul = $("shortlist");
    ul.innerHTML = "";
    $("short-empty").hidden = list.length > 0;
    list.forEach(function (item, idx) {
      const li = document.createElement("li");
      li.innerHTML = '<button type="button" class="short-use"><strong></strong><span></span></button>' +
        '<button type="button" class="icon-btn" aria-label="Remove">×</button>';
      li.querySelector("strong").textContent = item.name;
      li.querySelector("span").textContent = item.set.sub + "/" + item.set.obj;
      li.querySelector(".short-use").addEventListener("click", function () { useItem(item); });
      li.querySelector(".icon-btn").addEventListener("click", function () {
        const next = getList();
        next.splice(idx, 1);
        T.store.set("names.shortlist", next);
        renderShortlist();
      });
      ul.appendChild(li);
    });
  }

  function useItem(item) {
    $("name").value = item.name;
    const match = Object.keys(SETS).find(function (k) {
      const s = SETS[k];
      return k !== "custom" && s.sub === item.set.sub && s.obj === item.set.obj && s.det === item.set.det;
    });
    if (match) setKey = match;
    else {
      setKey = "custom";
      $("c-sub").value = item.set.sub; $("c-obj").value = item.set.obj;
      $("c-det").value = item.set.det; $("c-pos").value = item.set.pos;
      $("c-ref").value = item.set.ref; $("c-plural").checked = !!item.set.plural;
    }
    renderPills();
    render();
  }

  $("save").addEventListener("click", function () {
    const name = $("name").value.trim();
    if (!name) { T.toast("Type a name first"); $("name").focus(); return; }
    const set = currentSet();
    const list = getList();
    const dupe = list.some(function (i) { return i.name.toLowerCase() === name.toLowerCase() && i.set.sub === set.sub && i.set.obj === set.obj; });
    if (dupe) { T.toast("Already on your shortlist"); return; }
    list.unshift({ name: name, set: { sub: set.sub, obj: set.obj, det: set.det, pos: set.pos, ref: set.ref, plural: set.plural } });
    T.store.set("names.shortlist", list.slice(0, 30));
    renderShortlist();
    T.toast("Added " + name + " to your shortlist");
  });

  $("shuffle").addEventListener("click", function () { order = shuffled(); render(); });
  $("name").addEventListener("input", render);
  ["c-sub", "c-obj", "c-det", "c-pos", "c-ref", "c-plural"].forEach(function (id) {
    $(id).addEventListener("input", render);
  });

  renderPills();
  renderShortlist();
  render();
})();
