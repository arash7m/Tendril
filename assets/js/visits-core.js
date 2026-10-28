/* Tendril appointments: shared helpers (tendril:visits.list).
   Each visit: { id, kind, name, date "YYYY-MM-DD", time "HH:MM" | "", where, note } */
(function (global) {
  "use strict";

  const KINDS = {
    doctor: { label: "Doctor" },
    blood: { label: "Blood test" },
    therapy: { label: "Therapy" },
    voice: { label: "Voice coach" },
    other: { label: "Appointment" }
  };

  function when(v) { return new Date(v.date + "T" + (v.time || "12:00")); }
  function title(v) { return v.name || KINDS[v.kind] ? (v.name || KINDS[v.kind].label) : "Appointment"; }

  function dayDiff(v) {
    const a = new Date(v.date + "T00:00"), b = new Date();
    b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
  }

  /** "Today at 9:30", "Tomorrow", "In 3 days", "In 2 weeks", "3 days ago" */
  function countdown(v) {
    const n = dayDiff(v);
    const t = v.time ? " at " + new Date("2000-01-01T" + v.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
    if (n === 0) return "Today" + t;
    if (n === 1) return "Tomorrow" + t;
    if (n === -1) return "Yesterday";
    if (n < 0) return (-n) + " days ago";
    if (n < 14) return "In " + n + " days";
    if (n < 60) return "In " + Math.round(n / 7) + " weeks";
    return "In " + Math.round(n / 30.4) + " months";
  }

  function all(store) {
    return store.get("visits.list", []).slice().sort(function (a, b) { return when(a) - when(b); });
  }
  function upcoming(store) { return all(store).filter(function (v) { return dayDiff(v) >= 0; }); }
  function past(store) { return all(store).filter(function (v) { return dayDiff(v) < 0; }).reverse(); }

  /** A calendar file for one visit, with a reminder the day before. */
  function ics(v, eventTitle) {
    const pad = function (n) { return String(n).padStart(2, "0"); };
    const safe = function (s) { return String(s || "").replace(/[\\;,]/g, function (c) { return "\\" + c; }).replace(/\n/g, "\\n"); };
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tendril//Appointments//EN", "BEGIN:VEVENT", "UID:" + v.id + "@tendril", "DTSTAMP:" + stamp];
    if (v.time) {
      const d = when(v);
      lines.push("DTSTART:" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00", "DURATION:PT1H");
    } else {
      const d = new Date(v.date + "T12:00"), e = new Date(d.getTime() + 86400000);
      lines.push("DTSTART;VALUE=DATE:" + v.date.replace(/-/g, ""), "DTEND;VALUE=DATE:" + e.getFullYear() + pad(e.getMonth() + 1) + pad(e.getDate()));
    }
    lines.push("SUMMARY:" + safe(eventTitle));
    if (v.where) lines.push("LOCATION:" + safe(v.where));
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + safe(eventTitle), "TRIGGER:-P1D", "END:VALARM", "END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }

  global.TendrilVisits = { KINDS: KINDS, when: when, title: title, dayDiff: dayDiff, countdown: countdown, all: all, upcoming: upcoming, past: past, ics: ics };
})(window);
