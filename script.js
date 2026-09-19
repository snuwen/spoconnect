(function () {
  'use strict';

  const REDIRECT_URI = location.origin + location.pathname;
  const SCOPES = 'user-read-currently-playing user-read-playback-state';

  const statusEl = document.getElementById('status');
  const clientIdField = document.getElementById('clientIdField');
  const clientIdInput = document.getElementById('clientIdInput');
  const connectBtn = document.getElementById('connectBtn');
  const resultEl = document.getElementById('result');
  const resultClientId = document.getElementById('resultClientId');
  const resultRefreshToken = document.getElementById('resultRefreshToken');

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
      throw new Error('Lost track of which Spotify app this was for — please try connecting again.');
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
    const tokens = await res.json();
    return { tokens, clientId };
  }

  function showResult(clientId, refreshToken) {
    clientIdField.hidden = true;
    connectBtn.hidden = true;
    resultClientId.value = clientId;
    resultRefreshToken.value = refreshToken || '';
    resultEl.hidden = false;
  }

  document.addEventListener('click', (e) => {
    const key = e.target && e.target.dataset && e.target.dataset.copy;
    if (!key) return;
    const input = document.getElementById(key);
    if (!input) return;
    input.select();
    navigator.clipboard && navigator.clipboard.writeText(input.value).catch(() => {
      document.execCommand('copy');
    });
    const original = e.target.textContent;
    e.target.textContent = 'Copied!';
    setTimeout(() => { e.target.textContent = original; }, 1200);
  });

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
      clientIdField.hidden = true;
      try {
        const { tokens, clientId } = await exchangeCode(code);
        if (window.opener) {
          window.opener.postMessage({ type: 'spotify-auth-success', tokens: tokens }, '*');
        }
        statusEl.textContent = 'Connected!';
        showResult(clientId, tokens.refresh_token);
      } catch (e) {
        statusEl.textContent = 'Something went wrong finishing the connection. ' + e.message;
        if (window.opener) {
          window.opener.postMessage({ type: 'spotify-auth-error', message: e.message }, '*');
        }
      }
      return;
    }

    const prefillClientId = params.get('client_id');
    if (prefillClientId) clientIdInput.value = prefillClientId;

    connectBtn.hidden = false;
    connectBtn.disabled = !clientIdInput.value.trim();
    clientIdInput.addEventListener('input', () => {
      connectBtn.disabled = !clientIdInput.value.trim();
    });

    connectBtn.addEventListener('click', () => {
      const clientId = clientIdInput.value.trim();
      if (!clientId) return;
      startAuth(clientId);
    });
  }

  init();
})();
