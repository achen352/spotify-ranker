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
  uris: string[];
  savedAt: number;
}

/** The playlist's order from just before we last overwrote it, so a save can be undone. */
export function loadBackup(playlistId: string): Backup | null {
  return read<Backup>(backupKey(playlistId));
}

export function saveBackup(playlistId: string, uris: string[]): void {
  localStorage.setItem(backupKey(playlistId), JSON.stringify({ uris, savedAt: Date.now() }));
}

export function loadLastPlaylist(): PlaylistSummary | null {
  return read<PlaylistSummary>(LAST_PLAYLIST_KEY);
}

export function saveLastPlaylist(playlist: PlaylistSummary | null): void {
  if (playlist) localStorage.setItem(LAST_PLAYLIST_KEY, JSON.stringify(playlist));
  else localStorage.removeItem(LAST_PLAYLIST_KEY);
}
