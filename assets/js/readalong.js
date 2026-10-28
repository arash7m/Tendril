/* Tendril read-along: text to read aloud, shown right next to the live graph.
   Settings in tendril:read.settings. TendrilReadAlong.init({ speaking }) where
   speaking() says whether a voice is currently being heard. */
(function (global) {
  "use strict";

  const PROMPTS = [
    { kind: "Warm-up", text: "Hum gently on “mmm” for a few seconds, then let it open into “mmm-ahh”." },
    { kind: "Warm-up", text: "Do a slow siren: slide from low to high and back down, like a soft “wooo”." },
    { kind: "Sentence", text: "Could you pass me the blue mug on the top shelf?" },
    { kind: "Sentence", text: "I’m meeting a friend for coffee at half past four." },
    { kind: "Sentence", text: "The bus was late again, so I walked along the river instead." },
    { kind: "Sentence", text: "My favourite season is autumn, when the leaves turn gold." },
    { kind: "Question", text: "Have you already seen the new exhibition downtown?" },
    { kind: "Question", text: "Would you like tea, or would you rather have something cold?" },
    { kind: "Counting", text: "Count slowly from one to ten, keeping each number light and easy." },
    { kind: "Phone call", text: "Hi, I’d like to book a table for two this Friday at eight, please." },
    { kind: "Phone call", text: "Hello, I’m calling about my order. Could you check its status for me?" },
    { kind: "Free talk", text: "Describe what you had for breakfast and how you’d make it again." }
  ];

  // Short passages written for Tendril.
  const PASSAGES = {
    market: { title: "Saturday market", text:
      "Every Saturday morning I walk down to the little market by the river. The baker is always first to set up, and the smell of warm bread reaches the corner before I do. I buy a loaf, then wander past the flower stall, where the owner knows everyone by name.\n\nToday she handed me a bunch of yellow tulips and said they reminded her of me. I laughed and told her she was being too kind. Then I picked up apples, a wedge of cheese, and a jar of honey from the beekeeper, who talked for ten minutes about his bees.\n\nOn the way home I sat on a bench and watched the boats drift past. It was a small, ordinary morning, and it was exactly what I needed." },
    clinic: { title: "Calling the clinic", text:
      "Good morning, my name is Alex, and I’m calling to book an appointment.\n\nI’d like to see the doctor sometime next week if possible. Mornings are best for me, but I can do Thursday afternoon as well.\n\nYes, I’m already registered with you. My date of birth is the fourth of March.\n\nThe appointment is for a routine check-up and some blood tests. Do I need to fast before the test, or is that not necessary?\n\nPerfect, Tuesday at nine thirty works. Could you send me a reminder by text?\n\nThank you so much for your help. Have a lovely day." },
    intro: { title: "Introducing yourself", text:
      "Hi, it’s nice to meet you. I’m Sam, and I’ve just joined the team this week.\n\nBefore this I worked at a small design studio for about three years. I mostly worked on posters and packaging, which was a lot of fun, but I wanted to try something new.\n\nOutside of work I love cooking, especially anything with too much garlic. I also go swimming a couple of times a week, and I’m slowly learning to play the guitar, although my neighbours might not agree that I’m improving.\n\nIf you ever want to grab lunch, just let me know. I’m still figuring out the best places around here." },
    lighthouse: { title: "The lighthouse keeper", text:
      "There was once a lighthouse at the edge of a quiet bay, and the keeper who lived there had a habit of talking to the sea.\n\nEach evening she climbed the narrow stairs, lit the great lamp, and told the waves about her day. She told them about the gulls that stole her sandwiches, the letters that arrived late, and the stars she had counted the night before.\n\nOne winter a storm rolled in, louder than any she had heard. The wind rattled the windows and the waves climbed the rocks. Still she kept the lamp burning and kept talking, softly and steadily, until morning came.\n\nWhen the sky cleared, a small fishing boat sailed safely into the harbour. The captain waved up at the tower, and the keeper, tired but smiling, waved back." },
    cafe: { title: "At the café", text:
      "Hi there! Could I get a medium oat latte, please?\n\nActually, make that a large. It’s been one of those mornings.\n\nAnd could I have one of those cinnamon buns as well? The one at the front looks perfect.\n\nNo, that’s everything, thank you. I’ll pay by card.\n\nIs it okay if I sit by the window? I’m waiting for a friend, and she always gets lost finding this place.\n\nThanks so much. Oh, and could I grab a glass of water too? Lovely, you’re a star." }
  };

  const SPEEDS = [0, 18, 32, 50]; // pixels per second while speaking
  const SPEED_LABELS = ["Scroll: off", "Scroll: slow", "Scroll: medium", "Scroll: fast"];

  function init(opts) {
    const T = global.Tendril;
    const $ = function (id) { return document.getElementById(id); };
    const box = $("reader-text");
    if (!box) return;
    let s = Object.assign({ source: "prompts", size: 1, speed: 0, own: "", prompt: 0 }, T.store.get("read.settings", {}));
    let raf = 0, last = 0, pos = 0;

    function save() { T.store.set("read.settings", s); }

    function render() {
      $("reader-source").value = s.source;
      box.style.setProperty("--reader-scale", s.size);
      const editing = !$("reader-edit").hidden;
      $("reader-foot-prompt").hidden = s.source !== "prompts";
      $("reader-foot-own").hidden = s.source === "prompts";
      $("reader-edit-btn").hidden = s.source !== "own";
      $("reader-speed").textContent = SPEED_LABELS[s.speed];
      $("reader-speed").setAttribute("aria-pressed", s.speed ? "true" : "false");
      $("reader-speed").hidden = s.source === "prompts";
      box.innerHTML = "";
      box.classList.toggle("is-prompt", s.source === "prompts");
      if (s.source === "prompts") {
        const p = PROMPTS[((s.prompt % PROMPTS.length) + PROMPTS.length) % PROMPTS.length];
        const kind = document.createElement("span");
        kind.className = "reader-kind";
        kind.textContent = p.kind;
        const t = document.createElement("p");
        t.textContent = p.text;
        box.appendChild(kind);
        box.appendChild(t);
        $("reader-count").textContent = (((s.prompt % PROMPTS.length) + PROMPTS.length) % PROMPTS.length + 1) + " of " + PROMPTS.length;
      } else {
        const text = s.source === "own" ? (s.own || "") : PASSAGES[s.source] ? PASSAGES[s.source].text : "";
        if (!text.trim()) {
          const p = document.createElement("p");
          p.className = "reader-empty";
          p.textContent = "Paste or type anything you’d like to practise: a script, a speech, song lyrics you’re allowed to use, or a message you’re nervous to say.";
          box.appendChild(p);
        } else {
          text.split(/\n\s*\n/).forEach(function (para) {
            const p = document.createElement("p");
            p.textContent = para.trim();
            box.appendChild(p);
          });
        }
      }
      $("reader-edit-wrap").hidden = !editing;
      box.hidden = editing;
      box.scrollTop = 0;
      pos = 0;
    }

    // Scrolls only while you're speaking, so pauses never leave you behind.
    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (!s.speed || s.source === "prompts" || box.hidden) return;
      if (opts && opts.speaking && opts.speaking()) {
        // Browsers round small scroll steps away, so keep an exact position.
        if (Math.abs(box.scrollTop - pos) > 3) pos = box.scrollTop; // you scrolled by hand
        pos = Math.min(pos + SPEEDS[s.speed] * s.size * dt, box.scrollHeight - box.clientHeight);
        box.scrollTop = pos;
      }
    }
    raf = requestAnimationFrame(tick);

    $("reader-source").addEventListener("change", function () {
      s.source = $("reader-source").value;
      $("reader-edit").hidden = true;
      if (s.source === "own" && !s.own) openEdit();
      save();
      render();
    });
    $("reader-smaller").addEventListener("click", function () { s.size = Math.max(0.8, +(s.size - 0.15).toFixed(2)); save(); render(); });
    $("reader-bigger").addEventListener("click", function () { s.size = Math.min(1.9, +(s.size + 0.15).toFixed(2)); save(); render(); });
    $("reader-speed").addEventListener("click", function () { s.speed = (s.speed + 1) % SPEEDS.length; save(); render(); });
    $("reader-next").addEventListener("click", function () { s.prompt++; save(); render(); });
    $("reader-prev").addEventListener("click", function () { s.prompt--; save(); render(); });
    $("reader-top").addEventListener("click", function () { pos = 0; box.scrollTo({ top: 0, behavior: "smooth" }); });

    function openEdit() {
      $("reader-edit").hidden = false;
      $("reader-edit").value = s.own || "";
      render();
      $("reader-edit").focus();
    }
    $("reader-edit-btn").addEventListener("click", openEdit);
    $("reader-edit-done").addEventListener("click", function () {
      s.own = $("reader-edit").value.slice(0, 20000);
      $("reader-edit").hidden = true;
      save();
      render();
    });

    render();
  }

  global.TendrilReadAlong = { init: init };
})(window);
