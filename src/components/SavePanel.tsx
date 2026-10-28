import { useState } from 'react';
import { orderPlaylist, rankedCount, rankedOrder, unrankedQueue, type RankingData } from '../ranking';
import {
  createPlaylist,
  replacePlaylistItems,
  SpotifyError,
  type Me,
  type PlaylistContents,
  type PlaylistSummary,
} from '../spotify/api';
import { loadBackup, saveBackup } from '../storage';

type Mode = 'idle' | 'confirm-overwrite' | 'confirm-restore' | 'new';

interface Preview {
  contents: PlaylistContents;
  order: string[];
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

export function SavePanel({ me, playlist, data, reload }: Props) {
  const canOverwrite = playlist.ownerId === me.id || playlist.collaborative;
  const [mode, setMode] = useState<Mode>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
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

  // Always build the new order from the playlist as it is right now, so songs added
  // elsewhere since this page loaded aren't lost.
  const openOverwrite = () =>
    run(async () => {
      const contents = await reload();
      const order = orderPlaylist(rankedOrder(data), contents.uris);
      setPreview({
        contents,
        order,
        ranked: rankedOrder(data).filter((u) => contents.tracks.has(u)).length,
        unranked: unrankedQueue(data, contents.uris).length,
      });
      setMode('confirm-overwrite');
    });

  // If a write fails partway, the preview is kept, so confirming again retries the same full order.
  const overwrite = () =>
    run(async () => {
      const { contents, order } = preview!;
      if (!backup) {
        saveBackup(playlist.id, contents.uris);
        setBackup(loadBackup(playlist.id));
      }
      try {
        await replacePlaylistItems(playlist.id, order);
      } catch (err) {
        throw new Error(`${describeError(err)} The playlist may be partly written; confirm again to retry.`);
      }
      setMode('idle');
      await reload();
      return { kind: 'ok', text: `Reordered “${playlist.name}” on Spotify.` };
    });

  const openRestore = () =>
    run(async () => {
      const contents = await reload();
      // Put back everything from the backup, plus anything added since at the end.
      const inBackup = new Set(backup!.uris);
      const order = [...backup!.uris, ...contents.uris.filter((u) => !inBackup.has(u))];
      setPreview({ contents, order, ranked: 0, unranked: 0 });
      setMode('confirm-restore');
    });

  const restore = () =>
    run(async () => {
      await replacePlaylistItems(playlist.id, preview!.order);
      setMode('idle');
      await reload();
      return { kind: 'ok', text: `Restored the original order of “${playlist.name}”.` };
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
          <p>Rewrite “{playlist.name}” in ranked order?</p>
          <ul className="small">
            <li>
              {plural(preview.ranked, 'ranked song')} first
              {preview.unranked > 0 && `, then ${plural(preview.unranked, 'unranked song')}`}.
            </li>
            <li>Spotify will show today as the “date added” for every song.</li>
            {preview.contents.localCount > 0 && (
              <li className="warn">
                {plural(preview.contents.localCount, 'local file')} can't be written back through Spotify's API and
                will be removed from the playlist.
              </li>
            )}
            {!backup && <li>The current order is saved in this browser so you can restore it.</li>}
          </ul>
          <div className="button-row">
            <button className="primary" disabled={busy} onClick={overwrite}>
              {busy ? 'Saving…' : 'Reorder playlist'}
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
            Put “{playlist.name}” back the way it was on {new Date(backup.savedAt).toLocaleString()}? Songs added since
            then stay, at the end.
          </p>
          <div className="button-row">
            <button className="primary" disabled={busy} onClick={restore}>
              {busy ? 'Restoring…' : 'Restore'}
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
