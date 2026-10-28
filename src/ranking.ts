// Beli-style ranking: each song first goes into a sentiment bucket, then gets placed within
// that bucket by binary search over head-to-head "which do you prefer?" comparisons.

export type Bucket = 'liked' | 'fine' | 'disliked';
export const BUCKETS: Bucket[] = ['liked', 'fine', 'disliked'];

export const BUCKET_INFO: Record<Bucket, { label: string; min: number; max: number }> = {
  liked: { label: 'I like it', min: 6.7, max: 10 },
  fine: { label: "It's fine", min: 3.4, max: 6.6 },
  disliked: { label: 'Not for me', min: 0, max: 3.3 },
};

export interface RankingData {
  /** Song URIs per bucket, best first. */
  ranked: Record<Bucket, string[]>;
  /** Songs the user skipped for now; they go to the back of the queue. */
  skipped: string[];
}

/** An in-progress placement of `uri` into `ranked[bucket]`, searching the index range [lo, hi]. */
export interface Insertion {
  uri: string;
  bucket: Bucket;
  lo: number;
  hi: number;
}

export type Choice = 'new' | 'existing' | 'tie';

export function emptyRanking(): RankingData {
  return { ranked: { liked: [], fine: [], disliked: [] }, skipped: [] };
}

export function rankedOrder(data: RankingData): string[] {
  return BUCKETS.flatMap((b) => data.ranked[b]);
}

export function rankedCount(data: RankingData): number {
  return BUCKETS.reduce((n, b) => n + data.ranked[b].length, 0);
}

/** Spreads scores evenly across the bucket's range, best song at the top of the range. */
export function scoreFor(bucket: Bucket, index: number, count: number): number {
  const { min, max } = BUCKET_INFO[bucket];
  if (count <= 1) return max;
  return Math.round((max - (max - min) * (index / (count - 1))) * 10) / 10;
}

/** Overall 1-based rank and current score of a ranked song. */
export function positionOf(data: RankingData, uri: string): { bucket: Bucket; rank: number; score: number } | null {
  let offset = 0;
  for (const bucket of BUCKETS) {
    const list = data.ranked[bucket];
    const index = list.indexOf(uri);
    if (index >= 0) return { bucket, rank: offset + index + 1, score: scoreFor(bucket, index, list.length) };
    offset += list.length;
  }
  return null;
}

/** Unique unranked URIs in playlist order, with skipped songs moved to the back. */
export function unrankedQueue(data: RankingData, playlistUris: string[]): string[] {
  const ranked = new Set(rankedOrder(data));
  const skipped = new Set(data.skipped);
  const fresh = [...new Set(playlistUris)].filter((u) => !ranked.has(u) && !skipped.has(u));
  return [...fresh, ...data.skipped.filter((u) => !ranked.has(u))];
}

function placeAt(data: RankingData, bucket: Bucket, uri: string, index: number): RankingData {
  const list = [...data.ranked[bucket]];
  list.splice(index, 0, uri);
  return {
    ranked: { ...data.ranked, [bucket]: list },
    skipped: data.skipped.filter((u) => u !== uri),
  };
}

/** The song the new one is currently being compared against. */
export function comparisonTarget(data: RankingData, ins: Insertion): string {
  return data.ranked[ins.bucket][Math.floor((ins.lo + ins.hi) / 2)];
}

/** Upper bound on how many more comparisons this placement needs. */
export function comparisonsLeft(ins: Insertion): number {
  return Math.ceil(Math.log2(ins.hi - ins.lo + 1));
}

interface Step {
  data: RankingData;
  /** null once the song has been placed. */
  insertion: Insertion | null;
}

export function startInsertion(data: RankingData, uri: string, bucket: Bucket): Step {
  const size = data.ranked[bucket].length;
  if (size === 0) return { data: placeAt(data, bucket, uri, 0), insertion: null };
  return { data, insertion: { uri, bucket, lo: 0, hi: size } };
}

export function answerComparison(data: RankingData, ins: Insertion, choice: Choice): Step {
  const mid = Math.floor((ins.lo + ins.hi) / 2);
  let { lo, hi } = ins;
  if (choice === 'new') hi = mid;
  else if (choice === 'existing') lo = mid + 1;
  else lo = hi = mid + 1; // "too tough": slot it right below the song it tied with

  if (lo >= hi) return { data: placeAt(data, ins.bucket, ins.uri, lo), insertion: null };
  return { data, insertion: { ...ins, lo, hi } };
}

export function removeFromRanking(data: RankingData, uri: string): RankingData {
  return {
    ranked: {
      liked: data.ranked.liked.filter((u) => u !== uri),
      fine: data.ranked.fine.filter((u) => u !== uri),
      disliked: data.ranked.disliked.filter((u) => u !== uri),
    },
    skipped: data.skipped.filter((u) => u !== uri),
  };
}

export function skip(data: RankingData, uri: string): RankingData {
  return { ...data, skipped: [...data.skipped.filter((u) => u !== uri), uri] };
}

/** Drops songs that are no longer in the playlist. */
export function prune(data: RankingData, playlistUris: string[]): RankingData {
  const present = new Set(playlistUris);
  const keep = (list: string[]) => list.filter((u) => present.has(u));
  return {
    ranked: { liked: keep(data.ranked.liked), fine: keep(data.ranked.fine), disliked: keep(data.ranked.disliked) },
    skipped: keep(data.skipped),
  };
}

/**
 * Reorders the playlist's songs so the `preferred` ones (e.g. the ranking, best first) lead,
 * followed by everything else in its current order. Only songs in the playlist are emitted,
 * and duplicate copies of a song stay together.
 */
export function orderPlaylist(preferred: string[], playlistUris: string[]): string[] {
  const copies = new Map<string, number>();
  for (const u of playlistUris) copies.set(u, (copies.get(u) ?? 0) + 1);

  const order: string[] = [];
  const emit = (uri: string) => {
    const n = copies.get(uri);
    if (!n) return;
    for (let i = 0; i < n; i++) order.push(uri);
    copies.delete(uri);
  };
  preferred.forEach(emit);
  playlistUris.forEach(emit);
  return order;
}
