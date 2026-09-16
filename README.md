# spoconnect

Tiny **public** page whose only job is to complete the Spotify sign-in
handshake (OAuth Authorization Code + PKCE) for the Now Playing widget
(`toolsv1`, private repo). It contains no widget logic, design, or product
code — just the few lines needed to satisfy Spotify's requirement that the
OAuth redirect target be a real `https://` page.

Runs entirely client-side (GitHub Pages, static hosting). No server, no
secret key — PKCE is designed for exactly this ("public client") case.

## One-time setup

1. **Enable GitHub Pages** for this repo:
   Settings → Pages → Source: `Deploy from a branch` → Branch: `main`, folder `/ (root)` → Save.
   This gives a URL like `https://snuwen.github.io/spoconnect/`.

2. **Register a Spotify app** at https://developer.spotify.com/dashboard:
   - Create app → note the **Client ID** (not secret, safe to hardcode here).
   - Add a **Redirect URI**: exactly the Pages URL from step 1, e.g.
     `https://snuwen.github.io/spoconnect/` (must match `script.js`'s
     `REDIRECT_URI`, which is computed from the page's own URL — trailing
     slash matters, Spotify matches it literally).
   - Scopes used: `user-read-currently-playing`, `user-read-playback-state`
     (read-only — this app never controls playback).

3. **Fill in the Client ID** in `script.js` (`const CLIENT_ID = '...'`).

## How it's used

The widget's configurator (in the private `toolsv1` repo) opens this page in
a popup when the user clicks "Connect Spotify". This page drives the Spotify
login/consent screen, exchanges the resulting code for tokens, and sends
them back to the configurator tab via `postMessage`, then closes itself. The
configurator is the one that stores/uses the tokens — this page holds
nothing persistently.
