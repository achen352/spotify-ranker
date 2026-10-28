import type { Move } from '../ranking';
import { getAccessToken } from './auth';

// Uses the post-February-2026 endpoints (/playlists/{id}/items, POST /me/playlists).
const BASE = 'https://api.spotify.com/v1';
const MAX_ITEMS_PER_WRITE = 100;

export class SpotifyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : BASE + pathOrUrl;
  const method = init.method ?? 'GET';
  let forceRefresh = false;
  let refreshed = false;

  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken(forceRefresh);
    forceRefresh = false;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });

    if (res.status === 401 && !refreshed) {
      forceRefresh = refreshed = true;
      continue;
    }
    // 429s are never applied, so they're always safe to retry. Only retry 5xx on reads,
    // since a failed-looking write may still have gone through.
    const retryable = res.status === 429 || (res.status >= 500 && method === 'GET');
    if (retryable && attempt < 5) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await sleep((retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000);
      continue;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new SpotifyError(res.status, data?.error?.message ?? `Spotify API error (${res.status})`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

interface Paging<T> {
  items: (T | null)[];
  next: string | null;
  total: number;
}

interface RawImage {
  url: string;
  width: number | null;
  height: number | null;
}

// Images come largest-first; pick a mid-size one for cards and the smallest for list rows.
function pickImages(images: RawImage[] | null | undefined) {
  if (!images?.length) return { image: null, thumb: null };
  return { image: (images[1] ?? images[0]).url, thumb: images[images.length - 1].url };
}

export interface Me {
  id: string;
  display_name: string | null;
}

export const getMe = () => request<Me>('/me');

export interface PlaylistSummary {
  id: string;
  name: string;
  image: string | null;
  total: number;
  ownerId: string;
  ownerName: string;
  collaborative: boolean;
}

interface RawPlaylist {
  id: string;
  name: string;
  images: RawImage[] | null;
  owner: { id: string; display_name?: string | null };
  collaborative: boolean;
  items?: { total: number };
  tracks?: { total: number };
}

function toPlaylistSummary(p: RawPlaylist): PlaylistSummary {
  return {
    id: p.id,
    name: p.name,
    image: pickImages(p.images).image,
    total: p.items?.total ?? p.tracks?.total ?? 0,
    ownerId: p.owner.id,
    ownerName: p.owner.display_name ?? p.owner.id,
    collaborative: p.collaborative,
  };
}

export async function getMyPlaylists(): Promise<PlaylistSummary[]> {
  const playlists: PlaylistSummary[] = [];
  let next: string | null = '/me/playlists?limit=50';
  while (next) {
    const page: Paging<RawPlaylist> = await request(next);
    for (const p of page.items) if (p) playlists.push(toPlaylistSummary(p));
    next = page.next;
  }
  return playlists;
}

export interface Track {
  uri: string;
  id: string;
  type: 'track' | 'episode';
  name: string;
  artists: string;
  album: string;
  image: string | null;
  thumb: string | null;
}

export interface PlaylistContents {
  /** Rankable item URIs in playlist order, duplicates included, local files excluded. */
  uris: string[];
  /**
   * One key per playlist position, local files and unreadable entries included, so moves can be
   * planned against Spotify's real positions. Placeholder keys are only meaningful within one fetch.
   */
  entries: string[];
  tracks: Map<string, Track>;
  /** Local files can't be added through the API, so we can't rank them or copy them to a new playlist. */
  localCount: number;
}

interface RawItem {
  uri: string;
  id: string | null;
  type: 'track' | 'episode';
  name: string;
  is_local?: boolean;
  artists?: { name: string }[];
  album?: { name: string; images: RawImage[] };
  show?: { name: string };
  images?: RawImage[];
}

function toTrack(t: RawItem): Track {
  const isEpisode = t.type === 'episode';
  return {
    uri: t.uri,
    id: t.id ?? t.uri.split(':').pop()!,
    type: isEpisode ? 'episode' : 'track',
    name: t.name,
    artists: isEpisode ? (t.show?.name ?? '') : (t.artists ?? []).map((a) => a.name).join(', '),
    album: t.album?.name ?? '',
    ...pickImages(isEpisode ? t.images : t.album?.images),
  };
}

export async function getPlaylistContents(playlistId: string): Promise<PlaylistContents> {
  const contents: PlaylistContents = { uris: [], entries: [], tracks: new Map(), localCount: 0 };
  let next: string | null = `/playlists/${playlistId}/items?limit=50&additional_types=track,episode`;
  while (next) {
    const page: Paging<{ is_local: boolean; item?: RawItem | null; track?: RawItem | null }> = await request(next);
    for (const entry of page.items) {
      const position = contents.entries.length;
      // `item` replaced the deprecated `track` field; accept either.
      const item = entry?.item ?? entry?.track;
      if (entry?.is_local || item?.is_local) {
        contents.entries.push(item?.uri ?? `local:${position}`);
        contents.localCount++;
      } else if (item?.uri) {
        contents.entries.push(item.uri);
        contents.uris.push(item.uri);
        if (!contents.tracks.has(item.uri)) contents.tracks.set(item.uri, toTrack(item));
      } else {
        contents.entries.push(`unreadable:${position}`);
      }
    }
    next = page.next;
  }
  return contents;
}

async function appendItems(playlistId: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += MAX_ITEMS_PER_WRITE) {
    await request(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + MAX_ITEMS_PER_WRITE) }),
    });
  }
}

/**
 * Applies `moves` in order using Spotify's in-place reorder, which keeps each song's
 * "date added" and leaves local files alone. Nothing is ever removed, so stopping partway
 * leaves every song in the playlist. Calls `onMove` after each move succeeds.
 */
export async function movePlaylistItems(
  playlistId: string,
  moves: Move[],
  onMove: (done: number) => void,
): Promise<void> {
  let snapshotId: string | undefined;
  for (const [i, move] of moves.entries()) {
    const res = await request<{ snapshot_id?: string } | undefined>(`/playlists/${playlistId}/items`, {
      method: 'PUT',
      body: JSON.stringify({
        range_start: move.rangeStart,
        insert_before: move.insertBefore,
        range_length: move.rangeLength,
        snapshot_id: snapshotId,
      }),
    });
    snapshotId = res?.snapshot_id;
    onMove(i + 1);
  }
}

export async function createPlaylist(name: string, description: string, uris: string[]): Promise<string> {
  const playlist = await request<{ id: string; external_urls: { spotify: string } }>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  });
  await appendItems(playlist.id, uris);
  return playlist.external_urls.spotify;
}
