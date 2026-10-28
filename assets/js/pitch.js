/* Tendril pitch detection (YIN algorithm).
   Runs entirely in the browser; no audio ever leaves the device. */
(function (global) {
  "use strict";

  const MIN_HZ = 60;
  const MAX_HZ = 500;

  /**
   * Estimate the fundamental frequency of one audio frame.
   * Returns { hz, clarity } or null when the frame is silent or unvoiced.
   */
  function detectPitch(buf, sampleRate, opts) {
    const o = opts || {};
    const threshold = o.threshold || 0.15;
    const minRms = o.minRms || 0.012;

    // Loudness gate: ignore silence and background hum.
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    if (rms < minRms) return null;

    const maxTau = Math.min(Math.floor(sampleRate / MIN_HZ), Math.floor(buf.length / 2));
    const minTau = Math.max(2, Math.floor(sampleRate / MAX_HZ));
    const W = buf.length - maxTau;
    const d = new Float32Array(maxTau + 1);

    // Difference function
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const diff = buf[i] - buf[i + tau];
        s += diff * diff;
      }
      d[tau] = s;
    }

    // Cumulative mean normalized difference
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      running += d[tau];
      d[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
    }

    // First dip under the threshold, then walk to its local minimum.
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;

    // Parabolic interpolation for sub-sample accuracy.
    let better = tau;
    if (tau > 1 && tau < maxTau) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const denom = a + c - 2 * b;
      if (denom !== 0) better = tau + (a - c) / (2 * denom);
    }

    const hz = sampleRate / better;
    if (hz < MIN_HZ || hz > MAX_HZ) return null;
    return { hz: hz, clarity: 1 - d[tau], rms: rms };
  }

  const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

  /** 220 Hz -> "A3" */
  function noteName(hz) {
    if (!hz) return "—";
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  /** Smooths a stream of readings with a short median window. */
  function makeSmoother(size) {
    const win = [];
    return function (hz) {
      if (hz == null) { win.length = 0; return null; }
      win.push(hz);
      if (win.length > size) win.shift();
      const sorted = win.slice().sort(function (a, b) { return a - b; });
      return sorted[Math.floor(sorted.length / 2)];
    };
  }

  global.TendrilPitch = { detectPitch: detectPitch, noteName: noteName, makeSmoother: makeSmoother, MIN_HZ: MIN_HZ, MAX_HZ: MAX_HZ };
})(window);
