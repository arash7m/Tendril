# Tendril

Small, private tools for trans and gender-diverse people.

Everything runs in the browser and is stored on the user's own device. There is no server, no account, and no analytics.

## What's here

| Page | What it does |
|---|---|
| `index.html` | Home page and privacy explainer |
| `timeline.html` | Journal entries with mood and tags, milestones with day counts, private photo diary with in-app camera (pose outline, timer), photo viewer and before/after compare; voice sessions appear in the feed |
| `voice.html` | Pitch trainer: live graph, target range, read-aloud prompts, recording analysis, session history |
| `doses.html` | Dose tracker: medications, dose log, next due, doses left, injection/patch site rotation on a body map, calendar reminders (.ics) |
| `names.html` | Name & pronoun sandbox: everyday sentences, read-aloud, private shortlist |
| `guides.html` | Binding, tucking, appointment prep, name-change checklist |
| `data.html` | Backup (optionally password-encrypted), restore, delete everything |

## Structure

```
assets/css/tendril.css   shared tokens, header, buttons, forms, sheets (light + dark)
assets/css/*.css         one stylesheet per page
assets/js/common.js      storage wrapper, quick exit, toast, download, date helpers
assets/js/pitch.js       YIN pitch detection
assets/js/bodymap.js     body map picker and site rotation
assets/js/<page>.js      one script per page
```

Every page shares the same header markup. If you add a page, copy the header from an existing page and add a link to the nav in all pages.

Plain HTML, CSS and JavaScript with no build step. To run it locally:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Browsers only allow microphone access over HTTPS or on localhost.

## Where data lives

Everything is stored in the browser's localStorage under keys starting with `tendril:`:

| Key | Contents |
|---|---|
| `voice.target`, `voice.history` | Target range, session summaries |
| `doses.meds`, `doses.log` | Medications, logged doses |
| `names.shortlist` | Saved names and pronouns |
| `guides.checklist` | Ticked name-change items |
| `timeline.entries` | Journal entries and milestones (photo ids only) |

Photos and voice recordings are stored in IndexedDB (database `tendril`, stores `photos` and `recordings`). Each photo is saved re-encoded through a canvas, which strips location and camera metadata, as a full image (`id`) and a thumbnail (`id:thumb`). Backups can include them.

Backups are JSON files. With a password they're encrypted with AES-GCM using a key derived by PBKDF2 (SHA-256, 250,000 iterations).

## App lock

Optional PIN lock (set up on the Your data page). When it's on:

- All app data is kept as one AES-GCM encrypted entry (`tendril:__vault`); nothing readable stays in localStorage. Settings live in `tendril:__lock`.
- The key is derived from the PIN with PBKDF2 (SHA-256, 600,000 iterations). Recordings in IndexedDB are encrypted with the same key.
- After unlocking, the key is kept in sessionStorage so moving between pages doesn't ask again. Leaving the app starts a timer (right away, 1 or 5 minutes); coming back after it ran out locks.
- Page scripts start through `Tendril.ready(fn)`, which waits until data is readable. New pages must do the same.
- Five wrong PINs add a growing wait. A forgotten PIN can't be recovered; the lock screen offers to erase everything.

## App and offline

Tendril is a Progressive Web App. People can install it from the browser ("Add to Home Screen" on iPhone, "Install app" on Android and desktop). Once installed it opens full screen and works with no connection.

- `manifest.webmanifest` describes the app (name, icons, colors).
- `sw.js` is the service worker that caches every file for offline use.
- Fonts are self-hosted in `assets/fonts/` (SIL Open Font License), so the app never contacts Google or any other server.

**After changing any file, run `python3 tools/build-sw.py`** before committing. It refreshes the file list and version in `sw.js`, so installed apps pick up the update and show an "Update" button.

## Content review

The guides (binding, tucking, appointments) are general safety information and should be reviewed by trans community members and a clinician before launch.

## Hosting

The site is static, so GitHub Pages works as-is: **Settings → Pages → Deploy from a branch → `main` / root**.

## Privacy rules for contributors

- Never send user data anywhere. No fetch/XHR to third parties, no analytics.
- Store data only through `Tendril.store` (localStorage, prefixed `tendril:`).
- Audio is analyzed in memory and never recorded or uploaded.
- Every page includes the quick-exit button and `common.js`.
- Health content is information, not dosing advice.
