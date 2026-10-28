/* Tendril lab markers, unit conversion and small charts.
   Shared by the lab results page and the doctor summary. */
(function (global) {
  "use strict";

  // conv: how many of each unit equal 1 of the first unit.
  const MARKERS = {
    e2:   { name: "Estradiol", units: ["pg/mL", "pmol/L"], conv: { "pg/mL": 1, "pmol/L": 3.671 } },
    tt:   { name: "Testosterone (total)", units: ["ng/dL", "nmol/L"], conv: { "ng/dL": 1, "nmol/L": 0.03467 } },
    ft:   { name: "Free testosterone", units: ["pg/mL", "pmol/L", "ng/dL"], conv: { "pg/mL": 1, "pmol/L": 3.467, "ng/dL": 0.1 } },
    p4:   { name: "Progesterone", units: ["ng/mL", "nmol/L"], conv: { "ng/mL": 1, "nmol/L": 3.18 } },
    prl:  { name: "Prolactin", units: ["ng/mL", "µg/L", "mIU/L"], conv: { "ng/mL": 1, "µg/L": 1, "mIU/L": 21.2 } },
    lh:   { name: "LH", units: ["IU/L", "mIU/mL"], conv: { "IU/L": 1, "mIU/mL": 1 } },
    fsh:  { name: "FSH", units: ["IU/L", "mIU/mL"], conv: { "IU/L": 1, "mIU/mL": 1 } },
    shbg: { name: "SHBG", units: ["nmol/L"], conv: { "nmol/L": 1 } },
    k:    { name: "Potassium", units: ["mmol/L", "mEq/L"], conv: { "mmol/L": 1, "mEq/L": 1 } },
    hb:   { name: "Hemoglobin", units: ["g/dL", "g/L", "mmol/L"], conv: { "g/dL": 1, "g/L": 10, "mmol/L": 0.6206 } },
    hct:  { name: "Hematocrit", units: ["%", "L/L"], conv: { "%": 1, "L/L": 0.01 } },
    alt:  { name: "ALT", units: ["U/L"], conv: { "U/L": 1 } },
    ast:  { name: "AST", units: ["U/L"], conv: { "U/L": 1 } },
    cr:   { name: "Creatinine", units: ["mg/dL", "µmol/L"], conv: { "mg/dL": 1, "µmol/L": 88.4 } },
    chol: { name: "Total cholesterol", units: ["mg/dL", "mmol/L"], conv: { "mg/dL": 1, "mmol/L": 0.02586 } }
  };
  const ORDER = ["e2", "tt", "ft", "p4", "prl", "lh", "fsh", "shbg", "k", "hb", "hct", "alt", "ast", "cr", "chol"];

  function info(key, customName) {
    if (MARKERS[key]) return MARKERS[key];
    return { name: customName || key.replace(/^c:/, ""), units: [], conv: null, custom: true };
  }

  /** Convert a value between units of one marker. Returns null if not possible. */
  function convert(key, value, from, to) {
    if (from === to) return value;
    const m = MARKERS[key];
    if (!m || !m.conv || !(from in m.conv) || !(to in m.conv)) return null;
    return (value / m.conv[from]) * m.conv[to];
  }

  /** Every result for one marker, oldest first: { date, v, u, testId }. */
  function series(tests, key) {
    const out = [];
    tests.forEach(function (t) {
      (t.results || []).forEach(function (r) {
        if (r.m === key) out.push({ date: t.date, v: r.v, u: r.u, testId: t.id, example: t.example });
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  /** The same series in one unit (the latest result's unit). */
  function inUnit(key, list, unit) {
    return list.map(function (p) {
      const v = convert(key, p.v, p.u, unit);
      return v == null ? null : Object.assign({}, p, { v: v, u: unit });
    }).filter(Boolean);
  }

  function fmt(v) {
    if (v == null || !isFinite(v)) return "—";
    const a = Math.abs(v);
    const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return Number(v.toFixed(d)).toLocaleString(undefined, { maximumFractionDigits: d });
  }

  function rangeState(v, range) {
    if (!range || range.low == null && range.high == null) return null;
    if (range.low != null && v < range.low) return "below";
    if (range.high != null && v > range.high) return "above";
    return "within";
  }

  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function dateLabel(d, withYear) {
    return new Date(d + "T12:00").toLocaleDateString(undefined, withYear ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
  }

  /**
   * Draw a line chart of points ({date, v}) on a canvas, with an optional
   * shaded range. opts: { range: {low, high}, compact: bool, unit }
   */
  function chart(canvas, points, opts) {
    opts = opts || {};
    const dpr = global.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!points.length) return;

    const compact = !!opts.compact;
    const padL = compact ? 4 : 52, padR = compact ? 6 : 14, padT = compact ? 6 : 12, padB = compact ? 6 : 26;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const range = opts.range || {};
    let lo = Math.min.apply(null, points.map(function (p) { return p.v; }));
    let hi = Math.max.apply(null, points.map(function (p) { return p.v; }));
    if (range.low != null) lo = Math.min(lo, range.low);
    if (range.high != null) hi = Math.max(hi, range.high);
    if (lo === hi) { lo -= Math.abs(lo) * 0.2 || 1; hi += Math.abs(hi) * 0.2 || 1; }
    const span = hi - lo;
    lo = Math.max(0, lo - span * 0.12);
    hi = hi + span * 0.12;

    const t = function (d) { return new Date(d + "T12:00").getTime(); };
    const t0 = t(points[0].date), t1 = Math.max(t(points[points.length - 1].date), t0 + 86400000);
    const x = function (d) { return points.length === 1 ? padL + plotW / 2 : padL + plotW * ((t(d) - t0) / (t1 - t0)); };
    const y = function (v) { return padT + plotH * (1 - (v - lo) / (hi - lo)); };

    // Doctor's range
    if (range.low != null || range.high != null) {
      const top = y(range.high != null ? range.high : hi), bot = y(range.low != null ? range.low : lo);
      g.fillStyle = css("--band");
      g.fillRect(padL, top, plotW, bot - top);
    }

    if (!compact) {
      // Grid and value labels: four even steps
      g.font = "11px " + css("--font-mono");
      g.fillStyle = css("--muted");
      g.textAlign = "right";
      g.textBaseline = "middle";
      for (let i = 0; i <= 3; i++) {
        const v = lo + ((hi - lo) * i) / 3;
        g.strokeStyle = css("--line");
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(padL, Math.round(y(v)) + 0.5);
        g.lineTo(w - padR, Math.round(y(v)) + 0.5);
        g.stroke();
        g.fillText(fmt(v), padL - 8, y(v));
      }
      // Date labels: first and last (and middle if room)
      g.textBaseline = "top";
      const multiYear = points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4);
      const lab = points.length > 2 && plotW > 300 ? [0, Math.floor(points.length / 2), points.length - 1] : [0, points.length - 1];
      lab.filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i, k, arr) {
        g.textAlign = arr.length > 1 && k === 0 ? "left" : k === arr.length - 1 && arr.length > 1 ? "right" : "center";
        g.fillText(dateLabel(points[i].date, multiYear), x(points[i].date), h - padB + 7);
      });
    }

    // Line
    g.strokeStyle = css("--primary");
    g.lineWidth = compact ? 2 : 2.5;
    g.lineJoin = "round";
    g.beginPath();
    points.forEach(function (p, i) { if (i) g.lineTo(x(p.date), y(p.v)); else g.moveTo(x(p.date), y(p.v)); });
    g.stroke();

    // Points; the latest one emphasized
    points.forEach(function (p, i) {
      const last = i === points.length - 1;
      if (compact && !last) return;
      g.beginPath();
      g.arc(x(p.date), y(p.v), last ? (compact ? 4 : 5.5) : 3.5, 0, Math.PI * 2);
      g.fillStyle = last ? css("--secondary") : css("--primary");
      g.fill();
      if (last) { g.lineWidth = 2; g.strokeStyle = css("--surface"); g.stroke(); }
    });
  }

  global.TendrilLabs = { MARKERS: MARKERS, ORDER: ORDER, info: info, convert: convert, series: series, inUnit: inUnit, fmt: fmt, rangeState: rangeState, chart: chart, dateLabel: dateLabel };
})(window);
