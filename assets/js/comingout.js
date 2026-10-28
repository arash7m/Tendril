/* Tendril coming-out helper: builds an editable draft from a few choices.
   Saved drafts live in tendril:comingout.drafts. Nothing is sent anywhere. */
Tendril.ready(function () {
  "use strict";

  const T = window.Tendril;
  const $ = function (id) { return document.getElementById(id); };
  const form = $("co-form");

  const PERSONAL = ["parent", "sibling", "family", "partner", "friend"];
  const WORK = ["manager", "team", "school"];

  const DEFAULT_THEM = { parent: "Mom", sibling: "", family: "", partner: "", friend: "", manager: "", team: "everyone", school: "" };

  const TIPS = {
    parent: "Parents often need time. A first reaction isn’t always their final one, and many come around after a while.",
    sibling: "Siblings can be great allies with the rest of the family. You could ask them to be there when you tell others.",
    family: "Think about who in the family will be most supportive, and whether you want them to know first.",
    partner: "Leave room for their feelings too. It may take more than one conversation, and that’s normal.",
    friend: "Friends often take it in their stride. If they ask clumsy questions, it’s usually curiosity, not rejection.",
    manager: "Check your workplace’s policies first if you can, or ask HR quietly. Many places have protections for gender identity.",
    team: "Agree on timing with your manager first, and decide whether you or they will send the message.",
    school: "A school counselor or a teacher you trust can often help with records, registers and other teachers."
  };

  // ---------------- Reading the form ----------------
  function val(name) { const r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ""; }
  function includes(key) {
    const box = form.querySelector('#include input[value="' + key + '"]');
    return !!(box && box.checked && !box.closest("label").hidden);
  }
  function state() {
    const who = val("who");
    return {
      who: who,
      personal: PERSONAL.indexOf(who) >= 0,
      work: WORK.indexOf(who) >= 0,
      close: ["parent", "partner", "sibling"].indexOf(who) >= 0,
      them: $("them").value.trim(),
      format: val("format"),
      tone: val("tone"),
      identity: ($("identity").value.trim() || "trans"),
      name: $("myname").value.trim(),
      pronouns: $("pronouns").value.trim().replace(/\s+/g, "")
    };
  }

  // ---------------- Writing ----------------
  function opener(s) {
    const o = {
      parent: { warm: "There’s something important I want to share with you. I’ve thought a lot about how to say it, and writing it down helps me say it the way I mean it.", direct: "I want to tell you something important about me.", light: "I have some big news, and I wanted you to hear it from me first." },
      sibling: { warm: "You matter a lot to me, so I want you to hear this from me.", direct: "I want to tell you something about me.", light: "Okay, big news, and you get to hear it first." },
      family: { warm: "I want to share something important with you, because I don’t want to hide part of myself from my family.", direct: "I want to tell you something about me.", light: "I have some news I’d like to share with you." },
      partner: { warm: "Because I love you and trust you, I want you to know something I’ve been carrying for a while.", direct: "There’s something important I need to tell you.", light: "I have something big to share, and you’re the first person I wanted to tell." },
      friend: { warm: "You’re one of the people I trust most, so I want you to hear this from me.", direct: "I want to tell you something about me.", light: "Okay, big news time, and I wanted you to be one of the first to know." }
    };
    return (o[s.who] || o.family)[s.tone];
  }

  function identityLine(s) {
    if (s.tone === "warm") return "I’m " + s.identity + ". This isn’t a phase or a sudden decision. It’s something I’ve understood about myself for a long time, and I’m finally ready to live as who I am.";
    if (s.tone === "light") return "I’m " + s.identity + ", and honestly, I’m happier than I’ve been in a long time.";
    return "I’m " + s.identity + ".";
  }

  function nameLine(s) {
    if (!includes("name") || (!s.name && !s.pronouns)) return "";
    let t;
    if (s.name && s.pronouns) t = "I’m going by " + s.name + " now, and I use " + s.pronouns + " pronouns.";
    else if (s.name) t = "I’m going by " + s.name + " now.";
    else t = "I use " + s.pronouns + " pronouns.";
    t += " It would mean a lot if you’d use " + (s.name && s.pronouns ? "them" : "it") + ". If you slip up, that’s okay. A quick correction and moving on is all I need.";
    return t;
  }

  function personalBody(s) {
    const parts = [opener(s), identityLine(s), nameLine(s)];
    if (includes("medical")) parts.push("I’ve started medical transition with the support of a doctor, so you may notice some changes over time.");
    if (includes("same")) parts.push(s.close
      ? "I’m still the same person you know. I’m telling you because our relationship matters to me, and I don’t want to hide part of myself from you."
      : "I’m still the same person. I’m telling you because you matter to me.");
    const needs = [];
    if (includes("questions")) needs.push("Questions are welcome. I’d rather you ask me than guess.");
    if (includes("time")) needs.push("It’s okay if you need some time to take this in. I don’t expect a perfect reaction straight away.");
    if (needs.length) parts.push(needs.join(" "));
    if (includes("private")) parts.push("I’m not out to everyone yet, so please keep this between us for now. I’d like to tell others myself, in my own time.");
    const close = {
      warm: s.close ? "Thank you for reading this." : "Thank you for being someone I can tell. It means a lot.",
      direct: "Thank you for listening.",
      light: "Thanks for being you. Now you know!"
    };
    parts.push(close[s.tone]);
    return parts.filter(Boolean);
  }

  function workBody(s) {
    const pron = s.pronouns ? " and " + s.pronouns + " pronouns" : "";
    const name = s.name || "[your name]";
    if (s.who === "team") {
      const parts = ["I wanted to share some personal news. I’m transitioning, and from now on I’ll be going by " + name + pron + "."];
      parts.push("Nothing else about my work is changing. If you slip up with my name, a quick correction is all I need.");
      if (includes("questions")) parts.push("If you have questions, you’re welcome to ask me privately.");
      parts.push("Thank you for your support.");
      return parts;
    }
    const where = s.who === "school" ? "at school" : "at work";
    const parts = ["I’d like to let you know that I’m transitioning, and I’d like to start living as myself " + where + ". Going forward I’ll be using the name " + name + pron + "."];
    if (includes("medical")) parts.push("I’m also receiving medical care as part of my transition. I may occasionally need time for appointments, which I’ll arrange in the usual way.");
    if (includes("records")) parts.push(s.who === "school"
      ? "I’d appreciate help updating my name on class lists, registers and any school systems where that’s possible."
      : "I’d appreciate your help updating my email address, name badge, directory listing and any other records where that’s possible.");
    if (includes("announce")) parts.push(s.who === "school"
      ? "I’d also like to agree how teachers will be told, so I don’t have to explain it in every class."
      : "I’d also like to agree how and when to let the team know. I’m happy to write a short note, or for you to share it on my behalf.");
    if (includes("questions")) parts.push("I’m happy to answer questions, and I’d welcome a short conversation about next steps.");
    if (includes("private")) parts.push("Until we’ve agreed on that, please keep this confidential.");
    parts.push("Thank you for your support.");
    return parts;
  }

  function greeting(s) {
    const them = s.them || (s.who === "team" ? "everyone" : "");
    if (s.work) return s.who === "team" ? "Hi " + (them || "everyone") + "," : "Hi" + (them ? " " + them : "") + ",";
    return (s.tone === "warm" && them ? "Dear " : "Hi") + (them ? (s.tone === "warm" ? "" : " ") + them : "") + ",";
  }

  function signoff(s) {
    if (s.work) return "Best regards,\n" + (s.name || "[your name]");
    if (s.tone === "warm" && s.close) return "With love,\n" + (s.name || "");
    return s.name ? "– " + s.name : "";
  }

  function letter(s) {
    const body = s.work ? workBody(s) : personalBody(s);
    const subject = s.work && s.who !== "team" ? "Subject: My name and pronouns\n\n" : (s.who === "team" ? "Subject: A personal update\n\n" : "");
    return (subject + greeting(s) + "\n\n" + body.join("\n\n") + "\n\n" + signoff(s)).trim();
  }

  function points(s) {
    const lines = [];
    if (s.work) {
      lines.push("Ask for a few private minutes" + (s.who === "team" ? " at the start of a team meeting, or send a note instead" : "") + ".");
      lines.push("Say it plainly: “I’m transitioning, and I’d like to be known as " + (s.name || "[your name]") + (s.pronouns ? ", " + s.pronouns : "") + ", from now on.”");
      if (includes("records")) lines.push("Ask about updating email, badge and records.");
      if (includes("announce")) lines.push("Agree how and when others will be told, and who tells them.");
      if (includes("private")) lines.push("Ask them to keep it confidential until then.");
      lines.push("Thank them, and suggest a follow-up if they need to check anything.");
    } else {
      lines.push("Start: “" + opener(s).split(". ")[0].replace(/\.$/, "") + ".”");
      lines.push("Say it plainly: “I’m " + s.identity + ".” Then pause and give them a moment.");
      if (includes("name") && (s.name || s.pronouns)) lines.push("Name and pronouns: " + [s.name, s.pronouns].filter(Boolean).join(", ") + ". “If you slip up, just correct yourself and move on.”");
      if (includes("medical")) lines.push("Medical steps: say as much or as little as you want.");
      if (includes("same")) lines.push("“I’m still me. I’m telling you because you matter to me.”");
      if (includes("questions")) lines.push("Invite questions: “You can ask me anything.” It’s fine to say “I’d rather not answer that.”");
      if (includes("time")) lines.push("“You don’t need to have the perfect response right now.”");
      if (includes("private")) lines.push("Privacy: “Please don’t tell anyone else yet. I want to do that myself.”");
      lines.push("If it goes badly, it’s okay to stop: “I’ll give you some time. We can talk again later.”");
    }
    return lines.map(function (l) { return "• " + l; }).join("\n");
  }

  function shortText(s) {
    const n = s.name ? (s.pronouns ? "I’m going by " + s.name + " now (" + s.pronouns + "). " : "I’m going by " + s.name + " now. ") : (s.pronouns ? "I use " + s.pronouns + " pronouns. " : "");
    if (s.work) return "Hi" + (s.them ? " " + s.them : "") + ", I wanted to let you know I’m transitioning. " + n + "Could we find a time to talk about updating my details? Thank you!";
    const start = s.tone === "light" ? "Hey" + (s.them ? " " + s.them : "") + "! Some news: " : "Hi" + (s.them ? " " + s.them : "") + ". I wanted you to hear this from me: ";
    let t = start + "I’m " + s.identity + ". " + (includes("name") ? n : "");
    if (includes("private")) t += "I’m not out to everyone yet, so please keep it between us for now. ";
    t += s.tone === "warm" ? "I’d love to talk more whenever you’re ready." : s.tone === "light" ? "Happy to answer questions!" : "Thanks for listening.";
    return t;
  }

  function generate() {
    const s = state();
    if (s.format === "points") return points(s);
    if (s.format === "text") return shortText(s);
    return letter(s);
  }

  // ---------------- UI ----------------
  let edited = false;

  function syncVisibility() {
    const s = state();
    form.querySelectorAll("[data-personal]").forEach(function (l) { l.hidden = !s.personal; });
    form.querySelectorAll("[data-work]").forEach(function (l) { l.hidden = !s.work || s.who === "team"; });
    $("them").placeholder = DEFAULT_THEM[s.who] || (s.work ? "Sam" : "Alex");
    $("co-tip").textContent = TIPS[s.who] || "";
  }

  function refresh() {
    syncVisibility();
    if (edited) { $("regen").hidden = false; return; }
    $("draft").value = generate();
  }

  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  $("draft").addEventListener("input", function () {
    edited = true;
    $("draft-state").textContent = "Edited by you";
    $("regen").hidden = false;
  });
  $("regen").addEventListener("click", function () {
    edited = false;
    $("draft-state").textContent = "Updates as you choose";
    $("regen").hidden = true;
    $("draft").value = generate();
  });

  $("copy").addEventListener("click", function () {
    const text = $("draft").value;
    const done = function () { T.toast("Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { $("draft").select(); T.toast("Select all and copy"); });
    } else { $("draft").select(); T.toast("Select all and copy"); }
  });

  // ---------------- Saved drafts ----------------
  function drafts() { return T.store.get("comingout.drafts", []); }

  const WHO_LABEL = { parent: "Parent", sibling: "Sibling", family: "Family", partner: "Partner", friend: "Friend", manager: "Manager or HR", team: "Coworkers", school: "School" };

  function renderSaved() {
    const list = drafts();
    $("saved-section").hidden = list.length === 0;
    const host = $("saved-list");
    host.innerHTML = "";
    list.forEach(function (d) {
      const li = document.createElement("li");
      li.innerHTML = '<button type="button" class="saved-open"><strong></strong><span></span></button><button type="button" class="btn btn-soft btn-small">Delete</button>';
      li.querySelector("strong").textContent = (d.them ? d.them + " · " : "") + (WHO_LABEL[d.who] || "Draft");
      li.querySelector(".saved-open span").textContent = new Date(d.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · " + d.text.slice(0, 80).replace(/\s+/g, " ") + (d.text.length > 80 ? "…" : "");
      li.querySelector(".saved-open").addEventListener("click", function () {
        $("draft").value = d.text;
        edited = true;
        $("draft-state").textContent = "Saved draft";
        $("regen").hidden = false;
        $("draft").scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const del = li.querySelector(".btn");
      del.addEventListener("click", function () {
        if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Tap again"; return; }
        T.store.set("comingout.drafts", drafts().filter(function (x) { return x.id !== d.id; }));
        renderSaved();
      });
      host.appendChild(li);
    });
  }

  $("save-draft").addEventListener("click", function () {
    const s = state();
    const list = drafts();
    list.unshift({ id: "c" + T.uid(), at: new Date().toISOString(), who: s.who, them: s.them, text: $("draft").value });
    T.store.set("comingout.drafts", list.slice(0, 30));
    renderSaved();
    T.toast("Draft saved on this device");
  });

  // Suggest names from the name sandbox shortlist.
  const short = T.store.get("names.shortlist", []);
  short.forEach(function (n) {
    const o = document.createElement("option");
    o.value = n.name;
    $("name-list").appendChild(o);
  });
  if (short.length) {
    $("myname").value = short[0].name;
    if (short[0].set) $("pronouns").value = short[0].set.sub + "/" + short[0].set.obj;
  }

  refresh();
  renderSaved();
});
