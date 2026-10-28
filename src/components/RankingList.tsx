import { BUCKET_INFO, BUCKETS, rankedCount, scoreFor, type RankingData } from '../ranking';
import type { Track } from '../spotify/api';
import { Cover } from './TrackViews';

function RowText({ track }: { track: Track }) {
  return (
    <span className="row-text">
      <span className="row-title">{track.name}</span>
      <span className="row-sub">{track.artists}</span>
    </span>
  );
}

interface RankingListProps {
  data: RankingData;
  tracks: Map<string, Track>;
  highlight: string | null;
  onRerank: (uri: string) => void;
}

export function RankingList({ data, tracks, highlight, onRerank }: RankingListProps) {
  if (rankedCount(data) === 0) {
    return <p className="muted small empty">Songs you rank show up here, best first.</p>;
  }

  let offset = 0;
  return (
    <div className="list">
      {BUCKETS.map((bucket) => {
        const list = data.ranked[bucket];
        const start = offset;
        offset += list.length;
        if (!list.length) return null;
        return (
          <section key={bucket}>
            <h3 className={`bucket-heading ${bucket}`}>
              {BUCKET_INFO[bucket].label}
              <span>{list.length}</span>
            </h3>
            <ol className="rows">
              {list.map((uri, i) => {
                const track = tracks.get(uri);
                if (!track) return null;
                return (
                  <li key={uri} className={`row${uri === highlight ? ' fresh' : ''}`}>
                    <span className="rank">{start + i + 1}</span>
                    <Cover src={track.thumb} className="thumb" />
                    <RowText track={track} />
                    <span className={`score ${bucket}`}>{scoreFor(bucket, i, list.length).toFixed(1)}</span>
                    <button
                      className="icon-btn"
                      title="Re-rank this song"
                      aria-label={`Re-rank ${track.name}`}
                      onClick={() => onRerank(uri)}
                    >
                      ↺
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

interface UnrankedListProps {
  queue: string[];
  skipped: string[];
  tracks: Map<string, Track>;
  current: string | null;
  onRankNext: (uri: string) => void;
}

export function UnrankedList({ queue, skipped, tracks, current, onRankNext }: UnrankedListProps) {
  if (!queue.length) return <p className="muted small empty">Nothing left to rank.</p>;

  const skippedSet = new Set(skipped);
  return (
    <ol className="rows list">
      {queue.map((uri) => {
        const track = tracks.get(uri);
        if (!track) return null;
        return (
          <li key={uri} className={`row${uri === current ? ' current' : ''}`}>
            <Cover src={track.thumb} className="thumb" />
            <RowText track={track} />
            {skippedSet.has(uri) && <span className="tag">skipped</span>}
            {uri === current ? (
              <span className="tag now">now</span>
            ) : (
              <button className="small-btn" onClick={() => onRankNext(uri)}>
                Rank next
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
