// Authorization Code + PKCE flow. Runs entirely in the browser, so no client secret is needed.
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

export const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() ?? '';
export const REDIRECT_URI = `${window.location.origin}/callback`;
export const LOGOUT_EVENT = 'ranker:logout';

const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

const AUTH_KEY = 'ranker:auth';
const VERIFIER_KEY = 'ranker:pkce-verifier';
const STATE_KEY = 'ranker:pkce-state';

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class NotLoggedInError extends Error {
  constructor() {
    super('Not logged in to Spotify.');
  }
}

function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return loadAuth() !== null;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function beginLogin(): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(16);
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: Record<string, string>): Promise<StoredAuth> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token request failed (${res.status})`);
  }
  return {
    accessToken: data.access_token,
    // Spotify may or may not rotate the refresh token; keep the old one if it doesn't.
    refreshToken: data.refresh_token ?? body.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * If the page was loaded as the OAuth redirect (/callback), exchange the code for tokens
 * and clean up the URL. Safe to call on every page load.
 */
export async function handleRedirect(): Promise<void> {
  if (window.location.pathname !== '/callback') return;
  const params = new URLSearchParams(window.location.search);
  window.history.replaceState(null, '', '/');

  const error = params.get('error');
  if (error) throw new Error(error === 'access_denied' ? 'Spotify login was cancelled.' : `Spotify login failed: ${error}`);

  const code = params.get('code');
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!code || !verifier || params.get('state') !== localStorage.getItem(STATE_KEY)) {
    throw new Error('The Spotify login response did not match this browser session. Please try again.');
  }
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(STATE_KEY);

  const auth = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

let refreshing: Promise<string> | null = null;

async function refresh(refreshToken: string): Promise<string> {
  let auth: StoredAuth;
  try {
    auth = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID });
  } catch (err) {
    if (err instanceof TypeError) throw err; // network failure: keep the session
    logout();
    throw new NotLoggedInError();
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  return auth.accessToken;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  const auth = loadAuth();
  if (!auth) throw new NotLoggedInError();
  if (!forceRefresh && auth.expiresAt - 60_000 > Date.now()) return auth.accessToken;
  refreshing ??= refresh(auth.refreshToken).finally(() => {
    refreshing = null;
  });
  return refreshing;
}
