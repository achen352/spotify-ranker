import { beginLogin, REDIRECT_URI } from '../spotify/auth';

export function SetupScreen() {
  return (
    <main className="splash">
      <h1>Add your Spotify Client ID</h1>
      <ol className="setup-steps">
        <li>
          Create an app at{' '}
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            developer.spotify.com/dashboard
          </a>{' '}
          and tick <strong>Web API</strong>.
        </li>
        <li>
          Add this redirect URI: <code>{REDIRECT_URI}</code>
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_SPOTIFY_CLIENT_ID</code>.
        </li>
        <li>
          Restart <code>npm run dev</code>.
        </li>
      </ol>
    </main>
  );
}

export function LoginScreen({ error }: { error: string | null }) {
  return (
    <main className="splash">
      <h1>Rank a playlist, Beli style</h1>
      <p className="muted">
        Say how you feel about each song, then settle its spot with quick head-to-head picks. Save the final order back
        to Spotify.
      </p>
      <button className="primary big" onClick={() => beginLogin()}>
        Log in with Spotify
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
