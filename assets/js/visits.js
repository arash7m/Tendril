/* Tendril appointments page. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril, V = window.TendrilVisits;
  const $ = function (id) { return document.getElementById(id); };

  let editing = null;

  function list() { return T.store.get("visits.list", []); }
  function saveList(l) { T.store.set("visits.list", l); }

  function card(v, isPast) {
    const li = document.createElement("li");
    li.className = "visit" + (isPast ? " is-past" : "") + (V.dayDiff(v) <= 1 && !isPast ? " is-soon" : "");
    li.dataset.kind = v.kind;
    li.innerHTML =
      '<div class="visit-date"><span class="vd-day"></span><span class="vd-mon"></span></div>' +
      '<div class="visit-body">' +
        '<span class="visit-count"></span>' +
        '<h3 class="visit-title"></h3>' +
        '<p class="visit-where"></p>' +
        '<p class="visit-note"></p>' +
        '<div class="visit-actions"></div>' +
      '</div>';
    const d = new Date(v.date + "T12:00");
    li.querySelector(".vd-day").textContent = d.getDate();
    li.querySelector(".vd-mon").textContent = d.toLocaleDateString(undefined, { month: "short" });
    li.querySelector(".visit-count").textContent = V.countdown(v);
    li.querySelector(".visit-title").textContent = V.title(v);
    const where = li.querySelector(".visit-where");
    where.textContent = [V.KINDS[v.kind] && v.name ? V.KINDS[v.kind].label : "", v.where].filter(Boolean).join(" · ");
    where.hidden = !where.textContent;
    const note = li.querySelector(".visit-note");
    note.textContent = v.note || "";
    note.hidden = !v.note;

    const actions = li.querySelector(".visit-actions");
    const add = function (label, cls, fn, href) {
      const el = document.createElement(href ? "a" : "button");
      el.className = "btn btn-small " + cls;
      el.textContent = label;
      if (href) el.href = href; else { el.type = "button"; el.addEventListener("click", fn); }
      actions.appendChild(el);
    };
    if (!isPast) {
      if (v.kind === "doctor" || v.kind === "blood") add("Prepare summary", "btn-primary", null, "summary.html");
      add("Add to calendar", "btn-soft", function () {
        T.download("appointment.ics", V.ics(v, "Appointment"), "text/calendar");
        T.toast("Event downloaded. Open it to add it to your calendar");
      });
    } else if (v.kind === "blood") {
      add("Add results", "btn-primary", null, "labs.html");
    }
    add("Edit", "btn-soft", function () { openVisit(v); });
    return li;
  }

  function render() {
    const up = V.upcoming(T.store), past = V.past(T.store);
    const u = $("upcoming"), p = $("past");
    u.innerHTML = "";
    p.innerHTML = "";
    up.forEach(function (v) { u.appendChild(card(v, false)); });
    past.slice(0, 20).forEach(function (v) { p.appendChild(card(v, true)); });
    $("visits-empty").hidden = up.length > 0;
    $("add-visit").hidden = up.length === 0;
    $("past-panel").hidden = past.length === 0;
  }

  function todayValue() {
    const d = new Date(), pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function openVisit(v) {
    editing = v || null;
    $("visit-title").textContent = v ? "Edit appointment" : "Add appointment";
    document.querySelectorAll('#visit-kind input').forEach(function (r) { r.checked = r.value === (v ? v.kind : "doctor"); });
    $("visit-name").value = v ? v.name || "" : "";
    $("visit-date").value = v ? v.date : todayValue();
    $("visit-time").value = v ? v.time || "" : "";
    $("visit-where").value = v ? v.where || "" : "";
    $("visit-note").value = v ? v.note || "" : "";
    const del = $("visit-delete");
    del.hidden = !v;
    del.textContent = "Delete";
    delete del.dataset.armed;
    $("visit-sheet").showModal();
  }

  $("visit-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    const kind = document.querySelector('#visit-kind input:checked').value;
    const data = {
      kind: kind, name: $("visit-name").value.trim(), date: $("visit-date").value || todayValue(),
      time: $("visit-time").value, where: $("visit-where").value.trim(), note: $("visit-note").value.trim()
    };
    const l = list();
    if (editing) {
      const i = l.findIndex(function (x) { return x.id === editing.id; });
      if (i >= 0) l[i] = Object.assign(l[i], data);
    } else {
      l.push(Object.assign({ id: "v" + T.uid() }, data));
    }
    saveList(l);
    $("visit-sheet").close();
    render();
    T.toast(editing ? "Saved" : "Appointment added");
  });

  $("visit-delete").addEventListener("click", function () {
    const del = $("visit-delete");
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; return; }
    saveList(list().filter(function (x) { return x.id !== editing.id; }));
    $("visit-sheet").close();
    render();
    T.toast("Appointment deleted");
  });

  $("add-visit").addEventListener("click", function () { openVisit(null); });
  $("add-first").addEventListener("click", function () { openVisit(null); });
  document.querySelectorAll("dialog [data-close]").forEach(function (b) {
    b.addEventListener("click", function () { b.closest("dialog").close(); });
  });
  document.querySelectorAll("dialog.sheet").forEach(function (d) {
    d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); });
  });

  render();
});
