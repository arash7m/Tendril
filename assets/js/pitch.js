/* Tendril pitch detection (YIN algorithm).
   Runs entirely in the browser; no audio ever leaves the device. */
(function (global) {
  "use strict";

  const MIN_HZ = 60;
  const MAX_HZ = 500;

  /**
   * Estimate the fundamental frequency of one audio frame.
   * Returns { hz, clarity, rms } or null when the frame is silent or unvoiced.
   * opts.minRms sets the loudness gate (callers pass an adaptive noise floor).
   */
  function detectPitch(buf, sampleRate, opts) {
    const o = opts || {};
    const threshold = o.threshold || 0.2;
    const minRms = o.minRms != null ? o.minRms : 0.006;

    // Loudness gate: ignore silence and background hum.
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    if (rms < minRms) return null;

    // Work at about 12 kHz: plenty for voice pitch, 4x less work, and it
    // removes high-frequency noise that blurs the periodicity.
    const f = Math.max(1, Math.round(sampleRate / 12000));
    const rate = sampleRate / f;
    const n = Math.floor(buf.length / f);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < f; k++) s += buf[i * f + k];
      x[i] = s / f;
    }
    // Remove the average so hum and DC offset don't count as a "period".
    let mean = 0;
    for (let i = 0; i < n; i++) mean += x[i];
    mean /= n;
    for (let i = 0; i < n; i++) x[i] -= mean;

    const maxTau = Math.min(Math.floor(rate / MIN_HZ), Math.floor(n / 2));
    const minTau = Math.max(2, Math.floor(rate / MAX_HZ));
    const W = n - maxTau;
    const d = new Float32Array(maxTau + 2);

    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const diff = x[i] - x[i + tau];
        s += diff * diff;
      }
      d[tau] = s;
    }
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      running += d[tau];
      d[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
    }

    // First dip under the threshold; if there is none, fall back to the
    // deepest dip when it's still clearly periodic (soft or breathy voices).
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      // Take the first clear dip, not the deepest: the deepest is often at
      // two or three periods, which would read as half or a third the pitch.
      for (let t = minTau + 1; t < maxTau; t++) {
        if (d[t] < 0.45 && d[t] <= d[t - 1] && d[t] <= d[t + 1]) { tau = t; break; }
      }
    }
    if (tau < 0) return null;

    // Octave check: if there's a good dip at a half or a third of this lag,
    // the real period is that shorter one (otherwise a low voice can read
    // as half its pitch).
    for (let div = 2; div >= 2; div--) {
      const c = Math.round(tau / div);
      if (c < minTau) continue;
      let bestC = -1;
      for (let t = Math.max(minTau, Math.floor(c * 0.9)); t <= Math.min(maxTau - 1, Math.ceil(c * 1.1)); t++) {
        if (d[t] <= d[t - 1] && d[t] <= d[t + 1] && (bestC < 0 || d[t] < d[bestC])) bestC = t;
      }
      if (bestC > 0 && d[bestC] < Math.min(0.35, d[tau] + 0.15)) { tau = bestC; break; }
    }

    // Octave-too-high check: if twice this lag is a much deeper dip, this
    // was the second harmonic, which happens at the start of a syllable.
    const t2 = tau * 2;
    if (t2 + 1 < maxTau) {
      let b2 = t2;
      for (let t = Math.max(minTau, t2 - 2); t <= Math.min(maxTau - 1, t2 + 2); t++) if (d[t] < d[b2]) b2 = t;
      if (d[tau] > 0.12 && d[b2] < d[tau] * 0.4) tau = b2;
    }

    let better = tau;
    if (tau > 1 && tau < maxTau) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const denom = a + c - 2 * b;
      if (denom !== 0) better = tau + (a - c) / (2 * denom);
    }

    const hz = rate / better;
    if (hz < MIN_HZ || hz > MAX_HZ) return null;
    return { hz: hz, clarity: 1 - d[tau], rms: rms };
  }

  /**
   * Follows the room's background level so the loudness gate works for
   * quiet phone mics and noisy rooms alike. Feed it every frame's RMS.
   */
  function makeNoiseGate() {
    let floor = 0.004;
    return {
      update: function (rms, voiced) {
        if (!voiced) floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.995 + rms * 0.005;
        return Math.max(0.0025, floor * 2.2);
      }
    };
  }

  const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

  /** 220 Hz -> "A3" */
  function noteName(hz) {
    if (!hz) return "—";
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  /**
   * Smooths a stream of readings with a short median window. Short gaps
   * (a consonant, a breath) don't reset it, and octave slips (a reading at
   * half or double the recent pitch) are folded back.
   */
  function makeSmoother(size, holdFrames) {
    const win = [];
    let missed = 0, jumps = [], lastRef = null, lastAt = 0, n = 0;
    const hold = holdFrames == null ? 8 : holdFrames;
    return function (hz) {
      n++;
      if (hz == null) {
        if (++missed > hold && win.length) {
          lastRef = win.slice().sort(function (a, b) { return a - b; })[Math.floor(win.length / 2)];
          lastAt = n;
          win.length = 0;
        }
        return null;
      }
      missed = 0;
      // A new phrase usually starts near your recent pitch; fold an octave
      // slip at the very start back toward it (for up to ~10 s of pause).
      if (!win.length && lastRef && n - lastAt < 300) {
        const r = hz / lastRef;
        if (r > 1.75 && r < 2.3) hz /= 2;
        else if (r > 0.43 && r < 0.57) hz *= 2;
      }
      if (win.length >= 3) {
        const ref = win.slice().sort(function (a, b) { return a - b; })[Math.floor(win.length / 2)];
        const r = hz / ref;
        if (r > 1.8 && r < 2.2) hz /= 2;
        else if (r > 0.45 && r < 0.56) hz *= 2;
        // A sudden big jump is usually a glitch at the start or end of a
        // syllable. Only follow it if it lasts a few readings.
        const jump = Math.abs(Math.log(hz / ref));
        if (jump > Math.log(1.35)) {
          jumps.push(hz);
          if (jumps.length < 3) return ref;
          win.length = 0;
          jumps.forEach(function (j) { win.push(j); });
          jumps = [];
          return hz;
        }
        jumps = [];
      }
      // The start of a phrase isn't checked against anything yet, so wait for
      // three readings that agree (about 0.07 s) before showing a value.
      if (win.length < 3) {
        win.push(hz);
        if (win.length < 3) return null;
        const sorted3 = win.slice().sort(function (a, b) { return a - b; });
        if (sorted3[2] / sorted3[0] > 1.25) { win.shift(); return null; }
        return sorted3[1];
      }
      win.push(hz);
      if (win.length > size) win.shift();
      const sorted = win.slice().sort(function (a, b) { return a - b; });
      return sorted[Math.floor(sorted.length / 2)];
    };
  }

  global.TendrilPitch = { detectPitch: detectPitch, noteName: noteName, makeSmoother: makeSmoother, makeNoiseGate: makeNoiseGate, MIN_HZ: MIN_HZ, MAX_HZ: MAX_HZ };
})(window);
