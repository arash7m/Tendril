# Tendril

Small, private tools for trans and gender-diverse people.

Everything runs in the browser and is stored on the user's own device. There is no server, no account, and no analytics.

## What's here

| Page | Status |
|---|---|
| `index.html`: home page and privacy explainer | Ready |
| `voice.html`: pitch trainer with live graph, target range, prompts and session history | Ready |
| Dose tracker | Planned |
| Name & pronoun sandbox | Planned |
| Guides | Planned |

## Structure

```
index.html
voice.html
assets/
  css/tendril.css   shared tokens, header, buttons, panels (light + dark)
  css/voice.css     voice page layout
  js/common.js      safe localStorage wrapper + quick exit (button or Esc twice)
  js/pitch.js       YIN pitch detection, note names, smoothing
  js/voice.js       voice page: mic, recording analysis, graph, history
```

Plain HTML, CSS and JavaScript with no build step. To run it locally:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Browsers only allow microphone access over HTTPS or on localhost.

## Hosting

The site is static, so GitHub Pages works as-is: **Settings → Pages → Deploy from a branch → `main` / root**.

## Privacy rules for contributors

- Never send user data anywhere. No fetch/XHR to third parties, no analytics.
- Store data only through `Tendril.store` (localStorage, prefixed `tendril:`).
- Audio is analyzed in memory and never recorded or uploaded.
- Every page includes the quick-exit button and `common.js`.
- Health content is information, not dosing advice.
