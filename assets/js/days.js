/* Tendril days that matter: anniversaries of milestones (1 month, 100 days,
   6 months, 1 year…), the soft confetti used to celebrate them, and yearly
   calendar reminders. Milestones are timeline entries with kind "milestone". */
(function (global) {
  "use strict";

  const DAY = 86400000;
  const MONTHS = [1, 3, 6, 9, 18];                   // month marks before yearly ones take over
  const HRT_WORDS = /hormone|hrt|\bestrogen|\boestrogen|\bestradiol|testosterone|\bgel\b|\bshots?\b/i;
  const HRT_SHORT = /(^|\s)(T|E|E2)(\s|$)/;          // "Started T", "First day on E"

  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function diffDays(a, b) { return Math.round((dayStart(b) - dayStart(a)) / DAY); }
  function key(d) { const x = dayStart(d); return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate(); }

  /** The same day of the month, n months later (31 Jan + 1 month = 28/29 Feb). */
  function addMonths(start, n) {
    const s = dayStart(start);
    const y = s.getFullYear(), m = s.getMonth() + n;
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(s.getDate(), last));
  }

  function plural(n, word) { return n.toLocaleString() + " " + word + (n === 1 ? "" : "s"); }

  /** Every celebration for a start date, between two days (inclusive), oldest first. */
  function occasions(start, from, to) {
    const s = dayStart(start), a = dayStart(from), b = dayStart(to);
    const found = {};
    function add(d, label, n, rank) {
      if (d < a || d > b || d <= s) return;
      const k = key(d);
      if (!found[k] || found[k].rank < rank) found[k] = { date: d, label: label, n: n, rank: rank };
    }
    for (let y = Math.max(1, a.getFullYear() - s.getFullYear() - 1); y <= b.getFullYear() - s.getFullYear() + 1; y++) {
      add(addMonths(s, y * 12), plural(y, "year"), y, 3);
    }
    MONTHS.forEach(function (m) { add(addMonths(s, m), plural(m, "month"), m, 2); });
    const first = Math.max(1, Math.floor((a - s) / DAY) - 1), last = Math.ceil((b - s) / DAY) + 1;
    [100, 500].concat(Array.from({ length: 30 }, function (_, i) { return (i + 1) * 1000; })).forEach(function (n) {
      if (n >= first && n <= last) add(new Date(s.getFullYear(), s.getMonth(), s.getDate() + n), plural(n, "day"), n, 1);
    });
    return Object.keys(found).map(function (k) { return found[k]; }).sort(function (x, y) { return x.date - y.date; });
  }

  function milestones(store) {
    return store.get("timeline.entries", []).filter(function (e) { return e.kind === "milestone"; })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  /** Celebrations happening today: [{ ms, label, n, date }] */
  function today(list) {
    const now = new Date(), out = [];
    list.forEach(function (ms) {
      occasions(ms.at, now, now).forEach(function (o) { out.push(Object.assign({ ms: ms, inDays: 0 }, o)); });
    });
    return out.sort(function (a, b) { return b.rank - a.rank; });
  }

  /** Celebrations in the next `days` days (not today), soonest first. */
  function upcoming(list, days) {
    const now = new Date(), from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
    const out = [];
    list.forEach(function (ms) {
      occasions(ms.at, from, to).forEach(function (o) { out.push(Object.assign({ ms: ms, inDays: diffDays(now, o.date) }, o)); });
    });
    return out.sort(function (a, b) { return a.date - b.date || b.rank - a.rank; });
  }

  /** The next celebration for one milestone (looks up to two years ahead). */
  function next(ms) {
    return upcoming([ms], 760)[0] || null;
  }

  function inText(n) { return n === 0 ? "today" : n === 1 ? "tomorrow" : "in " + n + " days"; }

  /** The milestone that most likely marks starting hormones. */
  function hrtMilestone(list) {
    return list.find(function (e) { return HRT_WORDS.test(e.title || "") || HRT_SHORT.test(e.title || ""); }) || null;
  }

  /** First real logged dose, for suggesting a "Started hormones" milestone. */
  function firstDose(store) {
    const log = store.get("doses.log", []).filter(function (l) { return !l.example; });
    if (!log.length) return null;
    return log.reduce(function (a, b) { return new Date(a.at) < new Date(b.at) ? a : b; });
  }

  /** Has today's celebration of this occasion already been shown? Marks it shown. */
  function firstTimeToday(store, occ) {
    const seen = store.get("days.celebrated", {});
    const k = occ.ms.id + ":" + occ.n + occ.label.replace(/[^a-z]/g, "").slice(0, 1);
    const todayKey = key(new Date());
    if (seen[k] === todayKey) return false;
    // Keep the list short: drop entries from other days.
    Object.keys(seen).forEach(function (x) { if (seen[x] !== todayKey) delete seen[x]; });
    seen[k] = todayKey;
    store.set("days.celebrated", seen);
    return true;
  }

  /** A yearly all-day calendar event for a milestone's anniversary. */
  function ics(ms, eventTitle) {
    const pad = function (n) { return String(n).padStart(2, "0"); };
    const safe = function (s) { return String(s || "").replace(/[\\;,]/g, function (c) { return "\\" + c; }).replace(/\n/g, "\\n"); };
    const d = dayStart(ms.at), e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const ymd = function (x) { return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()); };
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tendril//Milestones//EN",
      "BEGIN:VEVENT", "UID:" + ms.id + "-yearly@tendril", "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + ymd(d), "DTEND;VALUE=DATE:" + ymd(e),
      "RRULE:FREQ=YEARLY", "SUMMARY:" + safe(eventTitle), "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + safe(eventTitle), "TRIGGER:PT9H", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR", ""
    ].join("\r\n");
  }

  /* ---------------- Confetti ----------------
     A soft pink, white and blue spray from (x, y), pointing up. */
  function confetti(x, y, opts) {
    const o = opts || {};
    if (global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const W = global.innerWidth, H = global.innerHeight;
    const ox = x != null ? x : W / 2, oy = y != null ? y : H * 0.4;

    const cv = document.createElement("canvas");
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60";
    document.body.appendChild(cv);
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);

    const COLORS = ["#FF4FA3", "#FFB3D6", "#FFFFFF", "#FFFFFF", "#3DA9FC", "#A8DBFF"];
    const scale = (Math.min(1, W / 520) * 0.5 + 0.5) * (o.power || 1);
    const count = o.count || 64, spread = o.spread || 1.5;
    const bits = [];
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const sp = (260 + Math.random() * 300) * scale;
      bits.push({
        x: ox + (Math.random() - 0.5) * (o.width || 30), y: oy,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 10,
        w: 4 + Math.random() * 4, h: 7 + Math.random() * 6,
        round: Math.random() < 0.3,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: (1.3 + Math.random() * 0.8) * (o.life || 1),
        wob: Math.random() * 6.3,
        delay: o.stagger ? Math.random() * o.stagger : 0
      });
    }

    let last = performance.now(), age = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; age += dt;
      g.clearRect(0, 0, W, H);
      let alive = 0;
      bits.forEach(function (b) {
        const t = age - b.delay;
        if (t > b.life) return;
        alive++;
        if (t < 0) return;
        b.vx *= Math.exp(-2.2 * dt);
        b.vy = b.vy * Math.exp(-2.2 * dt) + 520 * dt;              // drag, then gravity
        b.x += (b.vx + Math.sin(t * 5 + b.wob) * 22) * dt;         // a little flutter
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        g.globalAlpha = Math.max(0, Math.min(1, (b.life - t) / 0.45)) * 0.9;
        g.fillStyle = b.color;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        const flip = Math.abs(Math.cos(b.rot * 1.3));
        if (b.round) { g.beginPath(); g.arc(0, 0, b.w * 0.55, 0, 6.283); g.fill(); }
        else g.fillRect(-b.w / 2, -b.h / 2 * flip, b.w, b.h * flip + 1);
        g.restore();
      });
      if (alive) requestAnimationFrame(frame); else cv.remove();
    }
    requestAnimationFrame(frame);
  }

  /** Confetti from the top of an element (or the middle of the screen). */
  function confettiFrom(el, opts) {
    const r = el && el.getBoundingClientRect();
    const ok = r && r.width > 0 && r.bottom > 0 && r.top < global.innerHeight;
    confetti(ok ? r.left + r.width / 2 : null, ok ? r.top + Math.min(r.height * 0.3, 60) : null, Object.assign({ width: ok ? r.width * 0.6 : 30 }, opts));
  }

  global.TendrilDays = {
    occasions: occasions, milestones: milestones, today: today, upcoming: upcoming, next: next,
    inText: inText, hrtMilestone: hrtMilestone, firstDose: firstDose, firstTimeToday: firstTimeToday,
    ics: ics, confetti: confetti, confettiFrom: confettiFrom, diffDays: diffDays
  };
})(window);
