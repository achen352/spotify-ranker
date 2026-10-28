import { useEffect, useState } from 'react';
import { ExportImport } from './components/ExportImport';
import { PlaylistPicker } from './components/PlaylistPicker';
import { Ranker } from './components/Ranker';
import { LoginScreen, SetupScreen } from './components/Screens';
import { getMe, SpotifyError, type Me, type PlaylistSummary } from './spotify/api';
import { CLIENT_ID, isLoggedIn, LOGOUT_EVENT, logout } from './spotify/auth';
import { loadLastPlaylist, saveLastPlaylist } from './storage';

export function App({ loginError }: { loginError: string | null }) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(loginError);
  const [playlist, setPlaylist] = useState<PlaylistSummary | null>(loadLastPlaylist);

  useEffect(() => {
    const onLogout = () => {
      setLoggedIn(false);
      setMe(null);
    };
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    setError(null);
    getMe().then(setMe, (err: Error) => {
      const hint =
        err instanceof SpotifyError && err.status === 403
          ? ' In Development Mode, your account must be listed under User Management in the Spotify dashboard, and the app owner needs Premium.'
          : '';
      setError(err.message + hint);
    });
  }, [loggedIn]);

  const openPlaylist = (p: PlaylistSummary | null) => {
    saveLastPlaylist(p);
    setPlaylist(p);
  };

  if (!CLIENT_ID) return <SetupScreen />;
  if (!loggedIn) return <LoginScreen error={error} />;
  if (!me) {
    return (
      <main className="splash">
        {error ? (
          <>
            <p className="error">{error}</p>
            <button onClick={logout}>Log out</button>
          </>
        ) : (
          <p className="muted">Connecting to Spotify…</p>
        )}
      </main>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Playlist Ranker</span>
        {playlist && (
          <button className="ghost" onClick={() => openPlaylist(null)}>
            ← All playlists
          </button>
        )}
        <span className="spacer" />
        <ExportImport />
        <span className="muted small">{me.display_name ?? me.id}</span>
        <button className="ghost" onClick={logout}>
          Log out
        </button>
      </header>
      {playlist ? (
        <Ranker key={playlist.id} me={me} playlist={playlist} />
      ) : (
        <PlaylistPicker me={me} onPick={openPlaylist} />
      )}
    </div>
  );
}
