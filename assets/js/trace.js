/* Tendril: draws a measured value over time as one smooth, continuous line.
   Short silences (a consonant, a breath) are bridged so the line doesn't
   break up; longer pauses leave a gap. The part inside the target band is
   drawn solid and the rest faded, without splitting the curve. */
(function (global) {
  "use strict";

  /** Split points into runs, bridging gaps shorter than maxGap seconds. */
  function runs(points, key, t0, maxGap) {
    const out = [];
    let cur = null, lastT = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const v = p[key];
      if (v == null || p.t < t0 - maxGap) continue;
      if (!cur || p.t - lastT > maxGap) { cur = []; out.push(cur); }
      cur.push(p);
      lastT = p.t;
    }
    return out;
  }

  function pathFor(g, run, key, x, y) {
    g.beginPath();
    if (run.length === 1) {
      const px = x(run[0].t), py = y(run[0][key]);
      g.moveTo(px - 1, py);
      g.lineTo(px + 1, py);
      return;
    }
    g.moveTo(x(run[0].t), y(run[0][key]));
    // Quadratic curves through midpoints give a smooth line without overshoot.
    for (let i = 1; i < run.length - 1; i++) {
      const cx = x(run[i].t), cy = y(run[i][key]);
      const nx = (cx + x(run[i + 1].t)) / 2, ny = (cy + y(run[i + 1][key])) / 2;
      g.quadraticCurveTo(cx, cy, nx, ny);
    }
    const last = run[run.length - 1];
    g.lineTo(x(last.t), y(last[key]));
  }

  /**
   * Turn readings into one continuous line: while you speak it follows your
   * voice; brief silences (consonants, short breaths) hold the last value;
   * longer silences glide down to the floor and stay flat until you speak
   * again, when the line rises back up.
   */
  function continuous(points, key, floor, opts) {
    const o = opts || {};
    const hold = o.hold != null ? o.hold : 0.25;   // seconds a value is held through silence
    const tauUp = o.tauUp || 0.05;                 // how quickly it rises to your voice
    const tauDown = o.tauDown || 0.14;             // how quickly it falls to the floor
    const out = [];
    let v = floor, lastVal = null, lastT = -Infinity, prevT = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const raw = p[key];
      let target;
      if (raw != null) { target = raw; lastVal = raw; lastT = p.t; }
      else if (lastVal != null && p.t - lastT <= hold) target = lastVal;
      else target = floor;
      if (prevT == null) v = raw != null ? raw : floor;
      else {
        const dt = Math.max(0.001, p.t - prevT);
        const tau = target > v ? tauUp : tauDown;
        // Rising from the floor is quick, so the line jumps up when you speak.
        v += (target - v) * (1 - Math.exp(-dt / (v === floor && target > floor ? tauUp * 0.6 : tau)));
      }
      prevT = p.t;
      out.push({ t: p.t, v: v, voiced: raw != null || (lastVal != null && p.t - lastT <= hold) });
    }
    return out;
  }

  /**
   * opts: { key, x(t), y(v), t0, color, band: { top, bottom } in pixels,
   *         left, right (plot edges in pixels), floor, width, extendTo }
   * With opts.floor set, draws one unbroken line (see continuous()).
   */
  function draw(g, points, opts) {
    g.save();
    g.beginPath();
    g.rect(opts.left, 0, opts.right - opts.left, g.canvas.height);
    g.clip();
    g.lineWidth = opts.width || 2.75;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = opts.color;

    let rs;
    if (opts.floor != null) {
      const line = continuous(points, opts.key, opts.floor, opts).filter(function (p) { return p.t >= opts.t0 - 0.5; });
      if (opts.extendTo != null && line.length) {
        // Keep the line reaching the right edge between readings.
        const last = line[line.length - 1];
        if (opts.extendTo > last.t) line.push({ t: opts.extendTo, v: last.v });
      }
      rs = line.length ? [line] : [];
      opts = Object.assign({}, opts, { key: "v" });
    } else {
      rs = runs(points, opts.key, opts.t0, opts.maxGap || 0.6);
    }

    // Everything, faded
    g.globalAlpha = 0.32;
    rs.forEach(function (r) { pathFor(g, r, opts.key, opts.x, opts.y); g.stroke(); });

    // The part inside the target band, solid
    if (opts.band) {
      g.save();
      g.beginPath();
      g.rect(opts.left, opts.band.top, opts.right - opts.left, opts.band.bottom - opts.band.top);
      g.clip();
      g.globalAlpha = 1;
      rs.forEach(function (r) { pathFor(g, r, opts.key, opts.x, opts.y); g.stroke(); });
      g.restore();
    }
    g.restore();
    const lastRun = rs[rs.length - 1];
    return lastRun ? lastRun[lastRun.length - 1] : null;
  }

  /** Eases a displayed number toward a target each animation frame. */
  function easer(rate) {
    let v = null;
    return {
      step: function (target) {
        if (target == null) return v;
        v = v == null ? target : v + (target - v) * rate;
        return v;
      },
      reset: function () { v = null; },
      get: function () { return v; }
    };
  }

  global.TendrilTrace = { draw: draw, easer: easer, continuous: continuous };
})(window);
