/* Tendril dose tracker. Data lives in localStorage under tendril:doses.meds and tendril:doses.log. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, BM = window.TendrilBodyMap;
  const $ = function (id) { return document.getElementById(id); };

  const KINDS = {
    injection: { label: "Injection", verb: "Injected", sites: ["arm-l", "arm-r", "thigh-l", "thigh-r", "belly-l", "belly-r", "glute-l", "glute-r"], defaults: ["arm-l", "arm-r", "thigh-l", "thigh-r"] },
    patch: { label: "Patch", verb: "Applied", sites: ["belly-l", "belly-r", "glute-l", "glute-r", "thigh-l", "thigh-r", "arm-l", "arm-r"], defaults: ["belly-l", "belly-r", "glute-l", "glute-r"] },
    pill: { label: "Pill", verb: "Taken", sites: [], defaults: [] },
    gel: { label: "Gel", verb: "Applied", sites: [], defaults: [] },
    other: { label: "Other", verb: "Taken", sites: [], defaults: [] }
  };

  let meds = T.store.get("doses.meds", []);
  let log = T.store.get("doses.log", []);

  function save() {
    T.store.set("doses.meds", meds);
    T.store.set("doses.log", log);
  }

  // ---------------- Derived values ----------------
  function logFor(medId) {
    return log.filter(function (e) { return e.medId === medId; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  function nextDue(med) {
    const last = logFor(med.id)[0];
    if (!last) return null;
    return new Date(new Date(last.at).getTime() + med.everyDays * 86400000);
  }

  function dueState(due) {
    if (!due) return { key: "none", text: "Not logged yet" };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(due); d.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff < 0) return { key: "late", text: "Overdue · was due " + T.relDays(due) };
    if (diff === 0) return { key: "today", text: "Due today" };
    return { key: "soon", text: "Due " + T.relDays(due) };
  }

  function everyText(days) {
    if (days === 1) return "Every day";
    if (days === 3.5) return "Twice a week";
    if (days === 7) return "Every week";
    if (days === 14) return "Every 2 weeks";
    if (days % 7 === 0) return "Every " + days / 7 + " weeks";
    return "Every " + days + " days";
  }

  // ---------------- Render ----------------
  function render() {
    const grid = $("med-grid");
    grid.innerHTML = "";
    $("meds-empty").hidden = meds.length > 0;
    $("add-med").hidden = meds.length === 0;
    $("example-banner").hidden = !meds.some(function (m) { return m.example; });

    const sorted = meds.slice().sort(function (a, b) {
      const da = nextDue(a), db = nextDue(b);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

    sorted.forEach(function (med) {
      const kind = KINDS[med.kind] || KINDS.other;
      const entries = logFor(med.id);
      const last = entries[0];
      const due = nextDue(med);
      const state = dueState(due);
      const card = document.createElement("article");
      card.className = "med-card";
      card.dataset.state = state.key;

      const sitesHtml = med.sites && med.sites.length
        ? '<div class="med-sites">' +
            '<div><span class="k">Last site</span><span class="v" data-f="last-site"></span></div>' +
            '<div><span class="k">Try next</span><span class="v next" data-f="next-site"></span></div>' +
          '</div>'
        : "";

      card.innerHTML =
        '<div class="med-top">' +
          '<div class="med-name"><h3 data-f="name"></h3><p class="small muted" data-f="sub"></p></div>' +
          '<span class="due-chip" data-f="due"></span>' +
        '</div>' +
        '<dl class="med-facts">' +
          '<div><dt>Last dose</dt><dd data-f="last"></dd></div>' +
          '<div><dt>Next due</dt><dd data-f="next"></dd></div>' +
          (med.supply != null ? '<div><dt>Doses left</dt><dd data-f="supply"></dd></div>' : "") +
        '</dl>' +
        sitesHtml +
        '<div class="med-actions">' +
          '<button class="btn btn-primary btn-small" type="button" data-act="log">Log dose</button>' +
          '<button class="btn btn-soft btn-small" type="button" data-act="cal">Calendar reminder</button>' +
          '<button class="btn btn-soft btn-small" type="button" data-act="edit">Edit</button>' +
        '</div>';

      const f = function (name) { return card.querySelector('[data-f="' + name + '"]'); };
      f("name").textContent = med.name;
      f("sub").textContent = [kind.label, med.amount, everyText(med.everyDays)].filter(Boolean).join(" · ");
      f("due").textContent = state.text;
      f("last").textContent = last ? T.fmtDate(last.at) + " (" + T.relDays(last.at) + ")" : "—";
      f("next").textContent = due ? T.fmtDate(due) : "Log a dose to start";
      if (med.supply != null) {
        const daysLeft = med.supply * med.everyDays;
        f("supply").textContent = med.supply + (med.supply > 0 ? " · about " + Math.floor(daysLeft) + " days" : "");
        if (daysLeft <= 10) {
          const warn = document.createElement("p");
          warn.className = "refill";
          warn.textContent = med.supply === 0 ? "You’re out. Time to refill." : "Running low. Consider ordering a refill.";
          card.querySelector(".med-facts").after(warn);
        }
      }
      if (med.sites && med.sites.length) {
        const lastSite = entries.find(function (e) { return e.site; });
        f("last-site").textContent = lastSite ? BM.SITES[lastSite.site].label : "—";
        const sug = BM.suggest(med.sites, entries);
        f("next-site").textContent = sug ? BM.SITES[sug].label : "—";
      }

      card.querySelector('[data-act="log"]').addEventListener("click", function () { openLog(med); });
      card.querySelector('[data-act="edit"]').addEventListener("click", function () { openMed(med); });
      card.querySelector('[data-act="cal"]').addEventListener("click", function () { openCal(med); });
      grid.appendChild(card);
    });

    renderLog();
  }

  function renderLog() {
    const list = $("log-list");
    list.innerHTML = "";
    const all = log.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    $("log-empty").hidden = all.length > 0;
    $("history-count").textContent = all.length ? all.length + (all.length === 1 ? " dose" : " doses") : "";

    all.slice(0, 40).forEach(function (e) {
      const med = meds.find(function (m) { return m.id === e.medId; });
      const li = document.createElement("li");
      li.innerHTML =
        '<div class="log-when"><strong></strong><span></span></div>' +
        '<div class="log-what"><span class="log-med"></span><span class="log-detail"></span></div>' +
        '<button class="btn btn-soft btn-small" type="button">Delete</button>';
      li.querySelector(".log-when strong").textContent = T.fmtDate(e.at);
      li.querySelector(".log-when span").textContent = new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      li.querySelector(".log-med").textContent = med ? med.name : "Removed medication";
      li.querySelector(".log-detail").textContent = [e.site ? BM.SITES[e.site].label : "", e.note].filter(Boolean).join(" · ");
      const del = li.querySelector("button");
      del.addEventListener("click", function () {
        if (del.dataset.armed) {
          log = log.filter(function (x) { return x.id !== e.id; });
          if (med && med.supply != null) med.supply += 1;
          save();
          render();
          T.toast("Dose deleted");
        } else {
          del.dataset.armed = "1";
          del.textContent = "Tap again to delete";
          del.classList.add("danger");
          setTimeout(function () {
            if (!del.isConnected) return;
            delete del.dataset.armed;
            del.textContent = "Delete";
            del.classList.remove("danger");
          }, 3000);
        }
      });
      list.appendChild(li);
    });
  }

  // ---------------- Log sheet ----------------
  let logMed = null, logSite = null;

  function localInputValue(d) {
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function openLog(med) {
    logMed = med;
    $("log-title").textContent = "Log " + med.name;
    $("log-when").value = localInputValue(new Date());
    $("log-note").value = "";
    const hasSites = med.sites && med.sites.length > 0;
    $("site-field").hidden = !hasSites;
    if (hasSites) {
      const entries = logFor(med.id);
      const lastSite = entries.find(function (e) { return e.site; });
      logSite = BM.suggest(med.sites, entries);
      $("site-hint").textContent = "suggested site is pre-selected";
      drawMap(lastSite ? lastSite.site : null, logSite);
    } else {
      logSite = null;
    }
    $("log-sheet").showModal();
  }

  function drawMap(last, suggested) {
    BM.render($("bodymap"), {
      sites: logMed.sites, last: last, suggested: suggested, selected: logSite,
      onSelect: function (id) { logSite = id; drawMap(last, suggested); }
    });
    $("site-chosen").textContent = logSite ? "Chosen: " + BM.SITES[logSite].label : "No site chosen";
  }

  $("log-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const when = $("log-when").value ? new Date($("log-when").value) : new Date();
    log.push({
      id: T.uid(), medId: logMed.id, at: when.toISOString(),
      site: logMed.sites && logMed.sites.length ? logSite : null,
      note: $("log-note").value.trim()
    });
    if (logMed.supply != null && logMed.supply > 0) logMed.supply -= 1;
    save();
    $("log-sheet").close();
    render();
    T.toast((KINDS[logMed.kind] || KINDS.other).verb + (logSite && logMed.sites.length ? " · " + BM.SITES[logSite].label : "") + " · saved");
  });

  // ---------------- Medication sheet ----------------
  let editing = null;

  function selectedKind() {
    const r = document.querySelector('#med-kind input:checked');
    return r ? r.value : "other";
  }

  function renderSitePills(kind, chosen) {
    const host = $("med-sites");
    host.innerHTML = "";
    const list = KINDS[kind].sites;
    $("sites-field").hidden = list.length === 0;
    list.forEach(function (id) {
      const label = document.createElement("label");
      label.innerHTML = '<input type="checkbox"><span></span>';
      label.querySelector("input").value = id;
      label.querySelector("input").checked = chosen.indexOf(id) >= 0;
      label.querySelector("span").textContent = BM.SITES[id].label;
      host.appendChild(label);
    });
  }

  function openMed(med) {
    editing = med || null;
    $("med-title").textContent = med ? "Edit medication" : "Add medication";
    $("med-name").value = med ? med.name : "";
    $("med-amount").value = med ? med.amount || "" : "";
    $("med-every").value = med ? med.everyDays : 7;
    $("med-supply").value = med && med.supply != null ? med.supply : "";
    const kind = med ? med.kind : "injection";
    document.querySelectorAll('#med-kind input').forEach(function (r) { r.checked = r.value === kind; });
    renderSitePills(kind, med ? med.sites || [] : KINDS[kind].defaults);
    const del = $("delete-med");
    del.hidden = !med;
    del.textContent = "Delete medication";
    delete del.dataset.armed;
    $("med-sheet").showModal();
    if (!med) $("med-name").focus();
  }

  document.querySelectorAll('#med-kind input').forEach(function (r) {
    r.addEventListener("change", function () { renderSitePills(r.value, KINDS[r.value].defaults); });
  });
  document.querySelectorAll("[data-every]").forEach(function (b) {
    b.addEventListener("click", function () { $("med-every").value = b.dataset.every; });
  });

  $("med-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const kind = selectedKind();
    const sites = Array.prototype.map.call(document.querySelectorAll("#med-sites input:checked"), function (i) { return i.value; });
    if (KINDS[kind].sites.length && sites.length === 0) {
      T.toast("Choose at least one site, or pick a different type");
      return;
    }
    const supplyRaw = $("med-supply").value.trim();
    const data = {
      name: $("med-name").value.trim(),
      kind: kind,
      amount: $("med-amount").value.trim(),
      everyDays: Math.max(0.5, parseFloat($("med-every").value) || 1),
      sites: sites,
      supply: supplyRaw === "" ? null : Math.max(0, parseInt(supplyRaw, 10) || 0)
    };
    if (!data.name) return;
    if (editing) Object.assign(editing, data);
    else meds.push(Object.assign({ id: T.uid() }, data));
    save();
    $("med-sheet").close();
    render();
    T.toast(editing ? "Changes saved" : "Medication added");
  });

  $("delete-med").addEventListener("click", function () {
    const del = $("delete-med");
    if (!del.dataset.armed) {
      del.dataset.armed = "1";
      del.textContent = "Also deletes its history. Tap again";
      return;
    }
    const id = editing.id;
    meds = meds.filter(function (m) { return m.id !== id; });
    log = log.filter(function (e) { return e.medId !== id; });
    save();
    $("med-sheet").close();
    render();
    T.toast("Medication deleted");
  });

  // ---------------- Calendar reminder (.ics) ----------------
  let calMed = null;

  function openCal(med) {
    calMed = med;
    const due = nextDue(med) || new Date();
    const d = due < new Date() ? new Date() : due;
    const pad = function (n) { return String(n).padStart(2, "0"); };
    $("cal-date").value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    $("cal-name").value = "Reminder";
    updateCalSummary();
    $("cal-sheet").showModal();
  }

  function updateCalSummary() {
    if (!calMed) return;
    const days = calMed.everyDays;
    $("cal-summary").textContent = days === 3.5
      ? "Calendars can’t repeat every 3½ days, so this makes two weekly events, 3 and 4 days apart."
      : "Repeats " + everyText(days).toLowerCase() + " from the start date.";
  }

  function icsEvent(title, start, rrule) {
    const pad = function (n) { return String(n).padStart(2, "0"); };
    const local = function (d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"; };
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const safe = title.replace(/[\\;,]/g, function (c) { return "\\" + c; }).replace(/\n/g, " ");
    return [
      "BEGIN:VEVENT",
      "UID:" + T.uid() + "@tendril",
      "DTSTAMP:" + stamp,
      "DTSTART:" + local(start),
      "DURATION:PT10M",
      "RRULE:" + rrule,
      "SUMMARY:" + safe,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + safe,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT"
    ].join("\r\n");
  }

  $("cal-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const title = $("cal-name").value.trim() || "Reminder";
    const parts = $("cal-time").value.split(":");
    const start = new Date($("cal-date").value + "T00:00");
    start.setHours(parseInt(parts[0], 10) || 9, parseInt(parts[1], 10) || 0);
    const days = calMed.everyDays;
    let events;
    if (days === 3.5) {
      const second = new Date(start.getTime() + 3 * 86400000);
      events = [icsEvent(title, start, "FREQ=WEEKLY"), icsEvent(title, second, "FREQ=WEEKLY")];
    } else if (days % 7 === 0) {
      events = [icsEvent(title, start, "FREQ=WEEKLY;INTERVAL=" + days / 7)];
    } else {
      events = [icsEvent(title, start, "FREQ=DAILY;INTERVAL=" + Math.max(1, Math.round(days)))];
    }
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tendril//Reminders//EN", "CALSCALE:GREGORIAN"]
      .concat(events, ["END:VCALENDAR"]).join("\r\n");
    T.download("reminder.ics", ics, "text/calendar");
    $("cal-sheet").close();
    T.toast("Event downloaded. Open it to add it to your calendar");
  });

  // ---------------- Example data ----------------
  function loadExamples() {
    const now = Date.now(), day = 86400000;
    const inj = { id: T.uid(), name: "Estradiol (example)", kind: "injection", amount: "", everyDays: 7, sites: ["arm-l", "arm-r", "thigh-l", "thigh-r"], supply: 5, example: true };
    const pill = { id: T.uid(), name: "Spironolactone (example)", kind: "pill", amount: "", everyDays: 1, sites: [], supply: 24, example: true };
    meds = [inj, pill];
    log = [];
    const siteCycle = ["arm-l", "thigh-r", "arm-r", "thigh-l", "arm-l"];
    for (let i = 5; i >= 1; i--) {
      log.push({ id: T.uid(), medId: inj.id, at: new Date(now - (i * 7 - 1) * day).toISOString(), site: siteCycle[5 - i], note: i === 2 ? "Small bruise" : "", example: true });
    }
    for (let i = 6; i >= 1; i--) {
      log.push({ id: T.uid(), medId: pill.id, at: new Date(now - i * day).toISOString(), site: null, note: "", example: true });
    }
    save();
    render();
  }

  $("load-examples").addEventListener("click", loadExamples);
  $("clear-examples").addEventListener("click", function () {
    const ids = meds.filter(function (m) { return m.example; }).map(function (m) { return m.id; });
    meds = meds.filter(function (m) { return !m.example; });
    log = log.filter(function (e) { return ids.indexOf(e.medId) < 0; });
    save();
    render();
    T.toast("Example data cleared");
  });

  // ---------------- Wire up ----------------
  $("add-med").addEventListener("click", function () { openMed(null); });
  $("add-first").addEventListener("click", function () { openMed(null); });
  document.querySelectorAll("dialog [data-close]").forEach(function (b) {
    b.addEventListener("click", function () { b.closest("dialog").close(); });
  });
  document.querySelectorAll("dialog.sheet").forEach(function (d) {
    d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); });
  });

  render();

  // Opened from the home screen's "Log" button: doses.html?log=<medication id>
  try {
    const want = new URLSearchParams(location.search).get("log");
    const med = want && meds.find(function (m) { return m.id === want; });
    if (med) {
      history.replaceState(null, "", location.pathname);
      openLog(med);
    }
  } catch (e) { /* ignore */ }
});
