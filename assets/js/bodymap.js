/* Tendril body map: front and back figures with tappable injection/patch sites.
   Mirror convention: your left side is drawn on the left, in both views. */
(function (global) {
  "use strict";

  const SITES = {
    "arm-l":   { label: "Left arm",      view: "front", x: -47, y: 82 },
    "arm-r":   { label: "Right arm",     view: "front", x: 47,  y: 82 },
    "belly-l": { label: "Left belly",    view: "front", x: -16, y: 122 },
    "belly-r": { label: "Right belly",   view: "front", x: 16,  y: 122 },
    "thigh-l": { label: "Left thigh",    view: "front", x: -17, y: 196 },
    "thigh-r": { label: "Right thigh",   view: "front", x: 17,  y: 196 },
    "glute-l": { label: "Left buttock",  view: "back",  x: -16, y: 160 },
    "glute-r": { label: "Right buttock", view: "back",  x: 16,  y: 160 }
  };
  const ORDER = ["arm-l", "arm-r", "thigh-l", "thigh-r", "belly-l", "belly-r", "glute-l", "glute-r"];
  const CENTER = { front: 95, back: 265 };
  const NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function figure(svg, cx, title) {
    const g = el("g", { class: "bm-figure" }, svg);
    el("circle", { cx: cx, cy: 32, r: 17 }, g);
    el("rect", { x: cx - 8, y: 47, width: 16, height: 10, rx: 4 }, g);
    el("rect", { x: cx - 34, y: 55, width: 68, height: 100, rx: 22 }, g);
    el("rect", { x: cx - 56, y: 60, width: 17, height: 92, rx: 8.5 }, g);
    el("rect", { x: cx + 39, y: 60, width: 17, height: 92, rx: 8.5 }, g);
    el("rect", { x: cx - 31, y: 140, width: 28, height: 138, rx: 13 }, g);
    el("rect", { x: cx + 3, y: 140, width: 28, height: 138, rx: 13 }, g);
    const t = el("text", { x: cx, y: 300, class: "bm-title" }, svg);
    t.textContent = title;
  }

  /**
   * Render a picker into `host`.
   * opts: { sites: [ids], last: id|null, suggested: id|null, selected: id|null, onSelect(id) }
   */
  function render(host, opts) {
    host.innerHTML = "";
    const svg = el("svg", { viewBox: "0 0 360 312", class: "bodymap", role: "group", "aria-label": "Choose a site" });
    figure(svg, CENTER.front, "Front");
    figure(svg, CENTER.back, "Back");

    ORDER.forEach(function (id) {
      if (opts.sites.indexOf(id) < 0) return;
      const s = SITES[id];
      const cx = CENTER[s.view] + s.x, cy = s.y;
      const cls = ["bm-site"];
      if (id === opts.last) cls.push("is-last");
      if (id === opts.suggested) cls.push("is-suggested");
      if (id === opts.selected) cls.push("is-selected");
      const g = el("g", {
        class: cls.join(" "), tabindex: "0", role: "radio",
        "aria-checked": id === opts.selected ? "true" : "false",
        "aria-label": s.label + (id === opts.last ? ", used last time" : "") + (id === opts.suggested ? ", suggested next" : "")
      }, svg);
      el("circle", { cx: cx, cy: cy, r: 14, class: "bm-hit" }, g);
      el("circle", { cx: cx, cy: cy, r: 10, class: "bm-dot" }, g);
      if (id === opts.last || id === opts.suggested) {
        const tag = el("text", { x: cx, y: cy + 3.5, class: "bm-tag" }, g);
        tag.textContent = id === opts.last ? "L" : "★";
      }
      const pick = function () { if (opts.onSelect) opts.onSelect(id); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); }
      });
    });

    host.appendChild(svg);
  }

  /** Least recently used site among `sites`, given a log of { site, at }. */
  function suggest(sites, log) {
    const lastUse = {};
    log.forEach(function (e) {
      if (!e.site) return;
      const t = new Date(e.at).getTime();
      if (!(e.site in lastUse) || t > lastUse[e.site]) lastUse[e.site] = t;
    });
    let best = null, bestT = Infinity;
    ORDER.forEach(function (id) {
      if (sites.indexOf(id) < 0) return;
      const t = id in lastUse ? lastUse[id] : -Infinity;
      if (t < bestT) { bestT = t; best = id; }
    });
    return best;
  }

  global.TendrilBodyMap = { SITES: SITES, ORDER: ORDER, render: render, suggest: suggest };
})(window);
