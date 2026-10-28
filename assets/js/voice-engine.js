/* Tendril voice engine: microphone + pitch readings for the voice games.
   const eng = TendrilVoiceEngine.create(); await eng.start(); then call
   eng.poll() every animation frame: it returns the current pitch in Hz
   (smoothed) or null when you're not making a voiced sound. */
(function (global) {
  "use strict";

  function create() {
    const P = global.TendrilPitch;
    let audio = null, smooth = null, gate = null, level = 0.006, last = 0, current = null, heldAt = 0;

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      const Ctx = global.AudioContext || global.webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      audio = { ctx: ctx, stream: stream, an: an, buf: new Float32Array(2048) };
      smooth = P.makeSmoother(5, 12);
      gate = P.makeNoiseGate();
      level = 0.006;
      current = null;
    }

    function stop() {
      if (!audio) return;
      audio.stream.getTracks().forEach(function (t) { t.stop(); });
      try { audio.ctx.close(); } catch (e) { /* ignore */ }
      audio = null;
    }

    /** Latest pitch (Hz) or null. Analyses at most ~30 times a second. */
    function poll() {
      if (!audio) return null;
      const now = performance.now();
      if (now - last < 30) return current;
      last = now;
      audio.an.getFloatTimeDomainData(audio.buf);
      const r = P.detectPitch(audio.buf, audio.ctx.sampleRate, { minRms: level });
      const voiced = !!(r && r.clarity > 0.5);
      let e = 0;
      for (let i = 0; i < audio.buf.length; i += 4) e += audio.buf[i] * audio.buf[i];
      level = gate.update(Math.sqrt(e / (audio.buf.length / 4)), voiced);
      const hz = smooth(voiced ? r.hz : null);
      if (hz != null) { current = hz; heldAt = now; }
      else if (now - heldAt > 220) current = null; // keep the value through tiny gaps
      return current;
    }

    return { start: start, stop: stop, poll: poll, running: function () { return !!audio; } };
  }

  global.TendrilVoiceEngine = { create: create };
})(window);
