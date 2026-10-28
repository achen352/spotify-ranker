import { useEffect, useState } from 'react';
import { rankedCount } from '../ranking';
import { getMyPlaylists, type Me, type PlaylistSummary } from '../spotify/api';
import { loadRanking } from '../storage';
import { Cover } from './TrackViews';

export function PlaylistPicker({ me, onPick }: { me: Me; onPick: (p: PlaylistSummary) => void }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getMyPlaylists().then(setPlaylists, (err: Error) => setError(err.message));
  }, []);

  if (error) return <main className="picker error">Couldn't load your playlists: {error}</main>;
  if (!playlists) return <main className="picker muted">Loading your playlists…</main>;

  // Spotify only lets apps read the contents of playlists you own or collaborate on.
  const editable = playlists.filter((p) => p.ownerId === me.id || p.collaborative);
  const hidden = playlists.length - editable.length;
  const shown = editable.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <main className="picker">
      <div className="picker-head">
        <h1>Pick a playlist to rank</h1>
        <input
          className="search"
          type="search"
          placeholder="Search your playlists"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="playlist-grid">
        {shown.map((p) => {
          const ranked = rankedCount(loadRanking(p.id));
          return (
            <button key={p.id} className="playlist-card" onClick={() => onPick(p)}>
              <Cover src={p.image} className="playlist-cover" />
              <span className="playlist-name">{p.name}</span>
              <span className="muted small">
                {p.total} songs
                {ranked > 0 && <span className="ranked-badge"> · {ranked} ranked</span>}
              </span>
            </button>
          );
        })}
      </div>
      {!shown.length && <p className="muted">No playlists match.</p>}
      {hidden > 0 && (
        <p className="muted small footnote">
          {hidden} playlist{hidden === 1 ? '' : 's'} you follow but don't own {hidden === 1 ? 'is' : 'are'} hidden.
          Spotify only lets apps read playlists you own or collaborate on.
        </p>
      )}
    </main>
  );
}
