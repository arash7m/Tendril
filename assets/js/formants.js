/* Tendril resonance analysis.
   Estimates the first three formants (F1-F3) of a voiced frame with linear
   prediction (LPC), then turns them into a "brightness" score: 0 is close
   to typical adult male averages, 1 close to typical adult female averages,
   for the chosen vowel. It's an approximate guide, not a measurement lab. */
(function (global) {
  "use strict";

  const TARGET_RATE = 11025; // formants of interest sit below ~5 kHz
  const ORDER = 12;
  const BWMAX = 700;
  const LAG_BW = 45; // Hz

  // Average formants (Hz) from published vowel studies, rounded.
  // m = adult men, w = adult women.
  const REF = {
    ee:     { label: "Ee",     m: [340, 2300, 3000], w: [440, 2750, 3350], weights: [0.2, 0.45, 0.35] },
    ah:     { label: "Ah",     m: [770, 1330, 2520], w: [930, 1550, 2820], weights: [0.3, 0.35, 0.35] },
    oo:     { label: "Oo",     m: [380, 1000, 2340], w: [460, 1100, 2730], weights: [0.25, 0.25, 0.5] },
    speech: { label: "Speech", m: [500, 1550, 2620], w: [600, 1800, 3000], weights: [0.1, 0.3, 0.6] }
  };

  function downsample(buf, sampleRate) {
    const f = Math.max(1, Math.round(sampleRate / TARGET_RATE));
    const n = Math.floor(buf.length / f);
    const out = new Float64Array(n);
    // Averaging f samples is a cheap low-pass before dropping samples.
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < f; k++) s += buf[i * f + k];
      out[i] = s / f;
    }
    return { x: out, rate: sampleRate / f };
  }

  /** LPC coefficients a[0..p] (a[0] = 1) via autocorrelation + Levinson-Durbin. */
  function lpc(x, p, rate) {
    const n = x.length;
    // Pre-emphasis and Hamming window
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const pe = x[i] - 0.97 * (i ? x[i - 1] : 0);
      y[i] = pe * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)));
    }
    const r = new Float64Array(p + 1);
    for (let lag = 0; lag <= p; lag++) {
      let s = 0;
      for (let i = lag; i < n; i++) s += y[i] * y[i - lag];
      r[lag] = s;
    }
    if (r[0] <= 0) return null;
    // Lag window: smooths over individual harmonics so a high-pitched voice
    // doesn't fool the model into tracking a harmonic instead of a resonance.
    for (let lag = 1; lag <= p; lag++) {
      const g = (2 * Math.PI * LAG_BW * lag) / rate;
      r[lag] *= Math.exp(-0.5 * g * g);
    }
    r[0] *= 1.0001; // tiny lift for numerical stability
    const a = new Float64Array(p + 1);
    a[0] = 1;
    let err = r[0];
    for (let i = 1; i <= p; i++) {
      let acc = r[i];
      for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
      const k = -acc / err;
      const prev = a.slice();
      for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
      a[i] = k;
      err *= 1 - k * k;
      if (err <= 0) return null;
    }
    return a;
  }

  /** Complex roots of the LPC polynomial (Durand-Kerner iteration). */
  function roots(a) {
    const n = a.length - 1;
    // Polynomial z^n + a1 z^(n-1) + ... + an (a[0] = 1)
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * i) / n + 0.4;
      re[i] = 0.9 * Math.cos(ang);
      im[i] = 0.9 * Math.sin(ang);
    }
    for (let iter = 0; iter < 400; iter++) {
      let moved = 0;
      for (let i = 0; i < n; i++) {
        // p(z) by Horner
        let pr = 1, pi = 0;
        for (let k = 1; k <= n; k++) {
          const tr = pr * re[i] - pi * im[i] + a[k];
          pi = pr * im[i] + pi * re[i];
          pr = tr;
        }
        // product of (z_i - z_j)
        let qr = 1, qi = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dr = re[i] - re[j], di = im[i] - im[j];
          const tr = qr * dr - qi * di;
          qi = qr * di + qi * dr;
          qr = tr;
        }
        const den = qr * qr + qi * qi || 1e-30;
        const cr = (pr * qr + pi * qi) / den, ci = (pi * qr - pr * qi) / den;
        re[i] -= cr;
        im[i] -= ci;
        moved = Math.max(moved, Math.abs(cr) + Math.abs(ci));
      }
      if (moved < 1e-10) break;
    }
    const out = [];
    for (let i = 0; i < n; i++) out.push([re[i], im[i]]);
    return out;
  }

  /** Resonances (frequency, bandwidth) from the LPC roots, low to high. */
  function resonances(a, rate) {
    return roots(a)
      .filter(function (z) { return z[1] > 0; })
      .map(function (z) {
        const r = Math.hypot(z[0], z[1]);
        return { f: (Math.atan2(z[1], z[0]) * rate) / (2 * Math.PI), bw: (-Math.log(r) * rate) / Math.PI };
      })
      .filter(function (p) { return p.f > 150 && p.f < 4800 && p.bw > 0 && p.bw < BWMAX; })
      .sort(function (x, y) { return x.f - y.f; });
  }

  /** Pick F1-F3. Returns [F1, F2, F3] or null. */
  function pickFormants(peaks) {
    const f1 = peaks.find(function (p) { return p.f >= 200 && p.f <= 1100; });
    if (!f1) return null;
    const f2 = peaks.find(function (p) { return p.f > f1.f + 120 && p.f >= 550 && p.f <= 3200; });
    if (!f2) return null;
    const f3 = peaks.find(function (p) { return p.f > f2.f + 200 && p.f >= 1700 && p.f <= 4300; });
    if (!f3) return null;
    return [f1.f, f2.f, f3.f];
  }

  /** Estimate formants for one voiced frame. */
  function analyze(buf, sampleRate) {
    const d = downsample(buf, sampleRate);
    if (d.x.length < 128) return null;
    const a = lpc(d.x, ORDER, d.rate);
    if (!a) return null;
    return pickFormants(resonances(a, d.rate));
  }

  /** 0 ≈ typical male averages, 1 ≈ typical female averages, for this vowel. */
  function brightness(f, vowel) {
    const ref = REF[vowel] || REF.speech;
    let s = 0, wsum = 0;
    for (let i = 0; i < 3; i++) {
      const lo = Math.log(ref.m[i]), hi = Math.log(ref.w[i]);
      const pos = (Math.log(f[i]) - lo) / (hi - lo);
      s += ref.weights[i] * pos;
      wsum += ref.weights[i];
    }
    return s / wsum;
  }

  /** Median smoother over the last `size` formant triples. */
  function makeSmoother(size) {
    const win = [];
    return function (f) {
      if (!f) { win.length = 0; return null; }
      win.push(f);
      if (win.length > size) win.shift();
      if (win.length < 3) return null;
      return [0, 1, 2].map(function (i) {
        const v = win.map(function (t) { return t[i]; }).sort(function (a, b) { return a - b; });
        return v[Math.floor(v.length / 2)];
      });
    };
  }

  global.TendrilFormants = { analyze: analyze, brightness: brightness, makeSmoother: makeSmoother, REF: REF };
})(window);
