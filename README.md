# spoconnect

Tiny **public** page whose only job is to complete the Spotify sign-in
handshake (OAuth Authorization Code + PKCE) for the Now Playing widget
(`toolsv1`, private repo). It contains no widget logic, design, or product
code — just the few lines needed to satisfy Spotify's requirement that the
OAuth redirect target be a real `https://` page.

Runs entirely client-side (GitHub Pages, static hosting). No server, no
secret key — PKCE is designed for exactly this ("public client") case.

## Multi-tenant: no Client ID hardcoded here

Each **customer** registers their own Spotify app and provides their own
Client ID — this page doesn't hardcode one. Spotify's Development Mode
caps an app at ~5 authorized users, which would break fast with one shared
app across many customers; since each customer's app only ever
authenticates that one customer, the cap is a non-issue. The configurator
passes the Client ID in when it opens this page
(`spoconnect/?client_id=...`); this page stashes it in `sessionStorage`
alongside the PKCE verifier before redirecting to Spotify (Spotify's
redirect back strips our query params and replaces them with its own
`?code=...`, so anything needed after the round trip has to survive some
other way) and reads it back after the redirect to complete the token
exchange.

A Client ID isn't a secret — PKCE exists specifically so public clients
(like this one) never need a Client Secret at all.

## One-time setup (per this repo, not per customer)

1. **Enable GitHub Pages** for this repo:
   Settings → Pages → Source: `Deploy from a branch` → Branch: `main`, folder `/ (root)` → Save.
   This gives a URL like `https://snuwen.github.io/spoconnect/`.

That's it for this repo. Each **customer** separately does, on their own
Spotify account (see the customer-facing guide in `toolsv1`, still to be
written):

1. Register an app at https://developer.spotify.com/dashboard (requires a
   Spotify Premium account for their own account, at least as of 2026).
2. Add a **Redirect URI**: exactly this page's URL, e.g.
   `https://snuwen.github.io/spoconnect/` (must match `script.js`'s
   `REDIRECT_URI`, computed from the page's own URL — trailing slash
   matters, Spotify matches it literally). Scopes used:
   `user-read-currently-playing`, `user-read-playback-state` — read-only,
   this never controls playback.
3. Paste their Client ID into the widget's configurator.

## How it's used

The widget's configurator (in the private `toolsv1` repo) opens this page
in a popup, passing the customer's own Client ID, when they click "Connect
Spotify". This page drives the Spotify login/consent screen, exchanges the
resulting code for tokens, and sends them back to the configurator tab via
`postMessage`, then closes itself. The configurator is the one that
stores/uses the tokens — this page holds nothing persistently.
