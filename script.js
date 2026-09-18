/*
 * Spotify OAuth (Authorization Code + PKCE) relay page.
 *
 * Fully client-side, no server/secret involved. Meant to be opened as a
 * popup from the widget's configurator (which may be running locally, e.g.
 * from a file:// path or a customer's own machine — that's exactly why this
 * page needs to exist on a real https:// origin, since Spotify requires a
 * registered https redirect URI).
 *
 * Client ID is NOT hardcoded here: each customer registers their own
 * Spotify app (Development Mode's ~5-user cap is a non-issue when only
 * that one customer ever uses their own app) and the configurator passes
 * their Client ID in as ?client_id=... when it opens this page. That's
 * fine to pass around in the open — a Client ID isn't a secret, PKCE
 * exists specifically so public clients never need one.
 *
 * Flow:
 *   1. Configurator opens this page as a popup:
 *      spoconnect/?client_id=<their Client ID>
 *   2. No ?code= yet -> user clicks "Connect". We generate a PKCE
 *      verifier/challenge, stash both the verifier AND the client_id in
 *      sessionStorage (Spotify's redirect back strips our original query
 *      params and replaces them with its own ?code=..., so anything we
 *      need after the round trip has to survive some other way), and
 *      redirect to Spotify's authorize screen.
 *   3. Spotify redirects back here with ?code=... . We read the verifier
 *      and client_id back out of sessionStorage (same origin/tab, so they
 *      survived the round trip) and exchange the code for tokens directly
 *      against Spotify's token endpoint (CORS-enabled for PKCE clients —
 *      no backend needed).
 *   4. We hand the tokens back to the window that opened us via
 *      postMessage and close ourselves.
 */
(function () {
  'use strict';

  // Must exactly match a Redirect URI registered on the Spotify app (including
  // trailing slash / no trailing slash — Spotify matches this literally).
  const REDIRECT_URI = location.origin + location.pathname;

  const SCOPES = 'user-read-currently-playing user-read-playback-state';

  const statusEl = document.getElementById('status');
  const connectBtn = document.getElementById('connectBtn');

  function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = crypto.getRandomValues(new Uint8Array(length));
    let text = '';
    randomValues.forEach((v) => { text += possible[v % possible.length]; });
    return text;
  }

  async function sha256(plain) {
    const data = new TextEncoder().encode(plain);
    return crypto.subtle.digest('SHA-256', data);
  }

  function base64UrlEncode(buffer) {
    let str = '';
    new Uint8Array(buffer).forEach((b) => { str += String.fromCharCode(b); });
    return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  async function startAuth(clientId) {
    const verifier = generateRandomString(64);
    sessionStorage.setItem('spotify_pkce_verifier', verifier);
    sessionStorage.setItem('spotify_client_id', clientId);
    const challenge = base64UrlEncode(await sha256(verifier));

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge
    });
    location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
  }

  async function exchangeCode(code) {
    const verifier = sessionStorage.getItem('spotify_pkce_verifier');
    const clientId = sessionStorage.getItem('spotify_client_id');
    if (!clientId) {
      throw new Error('Lost track of which Spotify app this was for — please try connecting again from the widget setup page.');
    }
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier || ''
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('Token exchange failed (' + res.status + '): ' + text);
    }
    return res.json(); // { access_token, refresh_token, expires_in, ... }
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      statusEl.textContent = 'Spotify sign-in was cancelled or failed (' + error + ').';
      return;
    }

    if (code) {
      statusEl.textContent = 'Finishing connection…';
      try {
        const tokens = await exchangeCode(code);
        if (window.opener) {
          window.opener.postMessage({ type: 'spotify-auth-success', tokens: tokens }, '*');
          statusEl.textContent = 'Connected! You can close this window.';
          setTimeout(() => window.close(), 800);
        } else {
          statusEl.textContent = 'Connected — go back to the widget setup tab and click Connect again to finish.';
        }
      } catch (e) {
        statusEl.textContent = 'Something went wrong finishing the connection. ' + e.message;
        if (window.opener) {
          window.opener.postMessage({ type: 'spotify-auth-error', message: e.message }, '*');
        }
      }
      return;
    }

    // Fresh load, no code yet: this page must have been opened with the
    // customer's own Spotify Client ID.
    const clientId = params.get('client_id');
    if (!clientId) {
      statusEl.textContent = 'Missing Spotify Client ID — open this page from the widget setup page, not directly.';
      return;
    }

    statusEl.textContent = 'Click below to sign in with Spotify and allow read-only access to your currently playing track.';
    connectBtn.hidden = false;
    connectBtn.addEventListener('click', () => startAuth(clientId));
  }

  init();
})();
