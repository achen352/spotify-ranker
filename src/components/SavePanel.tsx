import { useState } from 'react';
import {
  orderPlaylist,
  planMoves,
  rankedCount,
  rankedOrder,
  unrankedQueue,
  type Move,
  type RankingData,
} from '../ranking';
import {
  createPlaylist,
  movePlaylistItems,
  SpotifyError,
  type Me,
  type PlaylistContents,
  type PlaylistSummary,
} from '../spotify/api';
import { loadBackup, saveBackup } from '../storage';

type Mode = 'idle' | 'confirm-overwrite' | 'confirm-restore' | 'new';

interface Preview {
  contents: PlaylistContents;
  /** Songs to put first, in this order; everything else follows in its current order. */
  preferred: string[];
  moves: Move[];
  ranked: number;
  unranked: number;
}

interface Notice {
  kind: 'ok' | 'error';
  text: string;
  link?: string;
}

interface Props {
  me: Me;
  playlist: PlaylistSummary;
  data: RankingData;
  /** Re-fetches the playlist from Spotify (and updates the ranker with it). */
  reload: () => Promise<PlaylistContents>;
}

function describeError(err: unknown): string {
  if (err instanceof SpotifyError && err.status === 403) {
    return `Spotify refused the change (403: ${err.message}).`;
  }
  return err instanceof Error ? err.message : String(err);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function planFor(preferred: string[], contents: PlaylistContents): Move[] {
  return planMoves(contents.entries, orderPlaylist(preferred, contents.entries));
}

export function SavePanel({ me, playlist, data, reload }: Props) {
  const canOverwrite = playlist.ownerId === me.id || playlist.collaborative;
  const [mode, setMode] = useState<Mode>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [newName, setNewName] = useState(`${playlist.name} (ranked)`);
  const [backup, setBackup] = useState(() => loadBackup(playlist.id));
  const ranked = rankedCount(data);

  async function run(task: () => Promise<Notice | void>) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await task();
      if (result) setNotice(result);
    } catch (err) {
      setNotice({ kind: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  // Always plan from the playlist as it is right now, so songs added elsewhere since this
  // page loaded are accounted for.
  const openOverwrite = () =>
    run(async () => {
      const contents = await reload();
      const preferred = rankedOrder(data);
      const moves = planFor(preferred, contents);
      if (!moves.length) return { kind: 'ok', text: `“${playlist.name}” is already in ranked order.` };
      setPreview({
        contents,
        preferred,
        moves,
        ranked: preferred.filter((u) => contents.tracks.has(u)).length,
        unranked: unrankedQueue(data, contents.uris).length,
      });
      setMode('confirm-overwrite');
    });

  const openRestore = () =>
    run(async () => {
      const contents = await reload();
      const preferred = backup!.uris;
      const moves = planFor(preferred, contents);
      if (!moves.length) return { kind: 'ok', text: `“${playlist.name}” is already in its original order.` };
      setPreview({ contents, preferred, moves, ranked: 0, unranked: 0 });
      setMode('confirm-restore');
    });

  // Applies the previewed moves, then re-fetches and re-plans to check the result. If a move
  // failed or the playlist was edited elsewhere meanwhile, running it again picks up from there.
  const apply = (successText: string) =>
    run(async () => {
      const { contents, preferred, moves } = preview!;
      if (!backup) {
        saveBackup(playlist.id, contents.entries);
        setBackup(loadBackup(playlist.id));
      }
      let done = 0;
      setProgress({ done, total: moves.length });
      try {
        await movePlaylistItems(playlist.id, moves, (n) => {
          done = n;
          setProgress({ done, total: moves.length });
        });
      } catch (err) {
        setMode('idle');
        throw new Error(
          `Stopped after ${done} of ${moves.length} moves: ${describeError(err)} No songs were removed; run it again to finish.`,
        );
      } finally {
        setProgress(null);
      }
      setMode('idle');
      const left = planFor(preferred, await reload()).length;
      if (left) {
        return { kind: 'error', text: `The order isn't fully applied yet (${plural(left, 'move')} left). Run it again to finish.` };
      }
      return { kind: 'ok', text: successText };
    });

  const createNew = () =>
    run(async () => {
      const contents = await reload();
      const name = newName.trim() || `${playlist.name} (ranked)`;
      const url = await createPlaylist(
        name,
        `“${playlist.name}”, ranked best to worst.`,
        orderPlaylist(rankedOrder(data), contents.uris),
      );
      setMode('idle');
      return { kind: 'ok', text: `Created “${name}”.`, link: url };
    });

  const cancel = () => {
    setMode('idle');
    setNotice(null);
  };

  const progressBar = progress && (
    <div className="move-progress">
      <div className="progress">
        <div className="progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </div>
      <span className="small muted">Keep this tab open until it finishes.</span>
    </div>
  );
  const applyLabel = (idle: string) => (progress ? `Moving… ${progress.done} / ${progress.total}` : busy ? 'Checking…' : idle);

  return (
    <div className="panel save-panel">
      <h2 className="panel-title">Save to Spotify</h2>

      {mode === 'idle' && (
        <>
          <p className="muted small">
            Ranked songs go first, best to worst. Unranked songs follow in their current order.
          </p>
          <div className="button-row">
            {canOverwrite && (
              <button className="primary" disabled={busy || !ranked} onClick={openOverwrite}>
                {busy ? 'Checking playlist…' : 'Reorder this playlist'}
              </button>
            )}
            <button disabled={busy || !ranked} onClick={() => setMode('new')}>
              Save as new playlist
            </button>
          </div>
          {backup && (
            <button className="link-btn" disabled={busy} onClick={openRestore}>
              Restore original order (saved {new Date(backup.savedAt).toLocaleDateString()})
            </button>
          )}
        </>
      )}

      {mode === 'confirm-overwrite' && preview && (
        <div className="confirm">
          <p>Reorder “{playlist.name}” by your ranking?</p>
          <ul className="small">
            <li>
              {plural(preview.ranked, 'ranked song')} first
              {preview.unranked > 0 && `, then ${plural(preview.unranked, 'unranked song')}`}.
            </li>
            <li>Songs are moved in place, so “date added” and local files stay as they are.</li>
            <li>Takes {plural(preview.moves.length, 'move')}, one request each.</li>
            {!backup && <li>The current order is saved in this browser so you can restore it.</li>}
          </ul>
          {progressBar}
          <div className="button-row">
            <button className="primary" disabled={busy} onClick={() => apply(`Reordered “${playlist.name}” on Spotify.`)}>
              {applyLabel('Reorder playlist')}
            </button>
            <button disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'confirm-restore' && preview && backup && (
        <div className="confirm">
          <p>
            Put “{playlist.name}” back in the order it had on {new Date(backup.savedAt).toLocaleString()}? Songs added
            since then go at the end. Takes {plural(preview.moves.length, 'move')}.
          </p>
          {progressBar}
          <div className="button-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() => apply(`Restored the original order of “${playlist.name}”.`)}
            >
              {applyLabel('Restore')}
            </button>
            <button disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'new' && (
        <form
          className="confirm"
          onSubmit={(e) => {
            e.preventDefault();
            createNew();
          }}
        >
          <label className="field">
            <span className="small muted">New playlist name (private)</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy} autoFocus />
          </label>
          <div className="button-row">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create playlist'}
            </button>
            <button type="button" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {notice && (
        <p className={`notice ${notice.kind}`}>
          {notice.text}{' '}
          {notice.link && (
            <a href={notice.link} target="_blank" rel="noreferrer">
              Open in Spotify ↗
            </a>
          )}
        </p>
      )}
    </div>
  );
}
