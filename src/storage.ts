import type { PlaylistSummary } from './spotify/api';
import { emptyRanking, type RankingData } from './ranking';

const rankingKey = (playlistId: string) => `ranker:ranking:${playlistId}`;
const backupKey = (playlistId: string) => `ranker:backup:${playlistId}`;
const LAST_PLAYLIST_KEY = 'ranker:last-playlist';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadRanking(playlistId: string): RankingData {
  const stored = read<RankingData>(rankingKey(playlistId));
  return stored?.ranked ? { ...emptyRanking(), ...stored } : emptyRanking();
}

export function saveRanking(playlistId: string, data: RankingData): void {
  localStorage.setItem(rankingKey(playlistId), JSON.stringify(data));
}

export interface Backup {
  /** Playlist entries in their original order (see PlaylistContents.entries). */
  uris: string[];
  savedAt: number;
}

/** The playlist's order from before we first reordered it, so it can be restored. */
export function loadBackup(playlistId: string): Backup | null {
  return read<Backup>(backupKey(playlistId));
}

export function saveBackup(playlistId: string, uris: string[]): void {
  localStorage.setItem(backupKey(playlistId), JSON.stringify({ uris, savedAt: Date.now() }));
}

// Export files hold rankings and original-order backups only, never login tokens.
const EXPORT_APP = 'spotify-ranker';
const isExported = (key: string) => key.startsWith('ranker:ranking:') || key.startsWith('ranker:backup:');

export function exportRankings(): string {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (isExported(key)) data[key] = localStorage.getItem(key)!;
  }
  return JSON.stringify({ app: EXPORT_APP, version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Validates an exportRankings() file and returns its entries, ready for importRankings(). */
export function parseRankingsFile(json: string): [string, string][] {
  let file: { app?: unknown; data?: unknown };
  try {
    file = JSON.parse(json);
  } catch {
    file = {};
  }
  if (file?.app !== EXPORT_APP || typeof file.data !== 'object' || !file.data) {
    throw new Error("That isn't a Playlist Ranker export file.");
  }
  return Object.entries(file.data).filter(
    (entry): entry is [string, string] => isExported(entry[0]) && typeof entry[1] === 'string',
  );
}

/** Writes imported entries, replacing any saved data for the same playlists. */
export function importRankings(entries: [string, string][]): void {
  for (const [key, value] of entries) localStorage.setItem(key, value);
}

export function loadLastPlaylist(): PlaylistSummary | null {
  return read<PlaylistSummary>(LAST_PLAYLIST_KEY);
}

export function saveLastPlaylist(playlist: PlaylistSummary | null): void {
  if (playlist) localStorage.setItem(LAST_PLAYLIST_KEY, JSON.stringify(playlist));
  else localStorage.removeItem(LAST_PLAYLIST_KEY);
}
