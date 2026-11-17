# Habits

Minimal habit + morning routine tracker. Static PWA, no backend; data lives in the phone's local storage.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000, or `http://<mac-ip>:8000` on your phone (same Wi-Fi; offline caching only works over HTTPS).

## Tests

```sh
./tests/run.sh
```

Runs in macOS JavaScriptCore via `osascript`, so no Node install is needed.

## Deploy (GitHub Pages)

1. Push to GitHub.
2. Settings → Pages → Deploy from branch → `main` / root.
3. On iPhone, open the Pages URL in Safari → Share → Add to Home Screen.

## Shipping updates

Push to `main`. The service worker is network-first, so the app picks up new files the next time it launches with a connection. Bump `VERSION` in `app.js` to confirm on the History page.

## Data

Export/Import a JSON backup from the bottom of the History page. Deleting the home screen app deletes its data.
