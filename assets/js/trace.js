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
   * opts: { key, x(t), y(v), t0, color, band: { top, bottom } in pixels,
   *         left, right (plot edges in pixels), maxGap, width }
   */
  function draw(g, points, opts) {
    const rs = runs(points, opts.key, opts.t0, opts.maxGap || 0.6);
    g.save();
    g.beginPath();
    g.rect(opts.left, 0, opts.right - opts.left, g.canvas.height);
    g.clip();
    g.lineWidth = opts.width || 2.75;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.strokeStyle = opts.color;

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

  global.TendrilTrace = { draw: draw, easer: easer };
})(window);
