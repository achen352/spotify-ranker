import { useCallback, useEffect, useState } from 'react';
import {
  answerComparison,
  BUCKET_INFO,
  BUCKETS,
  comparisonsLeft,
  comparisonTarget,
  positionOf,
  prune,
  rankedCount,
  removeFromRanking,
  skip,
  startInsertion,
  unrankedQueue,
  type Bucket,
  type Choice,
  type Insertion,
  type RankingData,
} from '../ranking';
import { getPlaylistContents, type Me, type PlaylistContents, type PlaylistSummary } from '../spotify/api';
import { loadRanking, saveRanking } from '../storage';
import { RankingList, UnrankedList } from './RankingList';
import { SavePanel } from './SavePanel';
import { ChoiceCard, Cover, TrackHero } from './TrackViews';

/** Everything undo needs to step back one action. */
interface Snapshot {
  data: RankingData;
  insertion: Insertion | null;
  focus: string | null;
}

const HISTORY_LIMIT = 100;

function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? initial : stored === '1';
  });
  useEffect(() => localStorage.setItem(key, value ? '1' : '0'), [key, value]);
  return [value, setValue] as const;
}

export function Ranker({ me, playlist }: { me: Me; playlist: PlaylistSummary }) {
  const [contents, setContents] = useState<PlaylistContents | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState(() => loadRanking(playlist.id));
  const [insertion, setInsertion] = useState<Insertion | null>(null);
  // A song the user picked to rank next, instead of the front of the queue.
  const [focus, setFocus] = useState<string | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [lastPlaced, setLastPlaced] = useState<string | null>(null);
  const [tab, setTab] = useState<'ranking' | 'unranked'>('ranking');
  const [showPlayers, setShowPlayers] = useStoredFlag('ranker:show-players', true);

  const reload = useCallback(async () => {
    const fresh = await getPlaylistContents(playlist.id);
    setContents(fresh);
    setData((d) => prune(d, fresh.uris));
    return fresh;
  }, [playlist.id]);

  const load = useCallback(() => {
    setLoadError(null);
    reload().catch((err: Error) => setLoadError(err.message));
  }, [reload]);

  useEffect(load, [load]);
  useEffect(() => saveRanking(playlist.id, data), [playlist.id, data]);

  const tracks = contents?.tracks ?? new Map();
  const queue = contents ? unrankedQueue(data, contents.uris) : [];
  const currentUri = insertion?.uri ?? (focus && queue.includes(focus) ? focus : queue[0]) ?? null;
  const current = currentUri ? tracks.get(currentUri) : undefined;
  const targetUri = insertion ? comparisonTarget(data, insertion) : undefined;
  const target = targetUri ? tracks.get(targetUri) : undefined;
  // Guard against an insertion whose bucket changed underneath it (e.g. songs removed on reload).
  const comparing = insertion && target ? insertion : null;

  const commit = (next: Snapshot) => {
    setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), { data, insertion, focus }]);
    setData(next.data);
    setInsertion(next.insertion);
    setFocus(next.focus);
  };

  const advance = (step: { data: RankingData; insertion: Insertion | null }) => {
    commit({ ...step, focus: step.insertion ? currentUri : null });
    if (!step.insertion) setLastPlaced(currentUri);
  };

  const chooseBucket = (bucket: Bucket) => currentUri && advance(startInsertion(data, currentUri, bucket));
  const answer = (choice: Choice) => comparing && advance(answerComparison(data, comparing, choice));
  const skipCurrent = () => currentUri && commit({ data: skip(data, currentUri), insertion: null, focus: null });
  const changeBucket = () => commit({ data, insertion: null, focus: currentUri });

  const rankNext = (uri: string, nextData = data) => {
    commit({ data: nextData, insertion: null, focus: uri });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const rerank = (uri: string) => rankNext(uri, removeFromRanking(data, uri));

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setData(prev.data);
    setInsertion(prev.insertion);
    setFocus(prev.focus);
    setLastPlaced(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'backspace') undo();
      else if (key === 's') skipCurrent();
      else if (comparing && key === 'arrowleft') answer('new');
      else if (comparing && key === 'arrowright') answer('existing');
      else if (comparing && (key === 'arrowdown' || key === 't')) answer('tie');
      else if (!comparing && current && ['1', '2', '3'].includes(key)) chooseBucket(BUCKETS[Number(key) - 1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const undoButton = (
    <button className="ghost" onClick={undo} disabled={!history.length}>
      Undo <kbd>Z</kbd>
    </button>
  );

  let stage;
  if (!contents) {
    stage = loadError ? (
      <div className="stage">
        <p className="error">Couldn't load this playlist: {loadError}</p>
        <button onClick={load}>Try again</button>
      </div>
    ) : (
      <div className="stage muted">Loading songs…</div>
    );
  } else if (!contents.uris.length) {
    stage = (
      <div className="stage">
        <h2>Nothing to rank</h2>
        <p className="muted">
          This playlist is empty{contents.localCount ? ' apart from local files, which the Spotify API can’t rank' : ''}.
        </p>
      </div>
    );
  } else if (!current) {
    stage = (
      <div className="stage">
        <h2>Every song is ranked</h2>
        <p className="muted">Save the order to Spotify, or re-rank any song with ↺ in the list.</p>
        <div className="stage-actions">{undoButton}</div>
      </div>
    );
  } else if (comparing && target) {
    const targetPos = positionOf(data, target.uri);
    stage = (
      <div className="stage">
        <p className="eyebrow">
          <span className={`dot ${comparing.bucket}`} />
          {BUCKET_INFO[comparing.bucket].label} · at most {comparisonsLeft(comparing)} more
        </p>
        <h2>Which do you prefer?</h2>
        <div className="versus">
          <ChoiceCard
            track={current}
            label="New"
            keyHint="←"
            showPlayer={showPlayers}
            onPick={() => answer('new')}
          />
          <span className="vs">or</span>
          <ChoiceCard
            track={target}
            label={targetPos ? `#${targetPos.rank} · ${targetPos.score.toFixed(1)}` : 'Ranked'}
            keyHint="→"
            showPlayer={showPlayers}
            onPick={() => answer('existing')}
          />
        </div>
        <div className="stage-actions">
          <button onClick={() => answer('tie')}>
            Too tough <kbd>↓</kbd>
          </button>
          <button className="ghost" onClick={changeBucket}>
            Change feeling
          </button>
          <button className="ghost" onClick={skipCurrent}>
            Skip <kbd>S</kbd>
          </button>
          {undoButton}
        </div>
      </div>
    );
  } else {
    const placed = lastPlaced ? positionOf(data, lastPlaced) : null;
    const placedTrack = lastPlaced ? tracks.get(lastPlaced) : undefined;
    stage = (
      <div className="stage">
        {placed && placedTrack && (
          <p className="placed">
            Placed <strong>{placedTrack.name}</strong> at #{placed.rank}
            <span className={`score ${placed.bucket}`}>{placed.score.toFixed(1)}</span>
          </p>
        )}
        <p className="eyebrow">{queue.length} left to rank</p>
        <TrackHero track={current} showPlayer={showPlayers} />
        <h2>How do you feel about it?</h2>
        <div className="bucket-buttons">
          {BUCKETS.map((bucket, i) => (
            <button key={bucket} className={`bucket-btn ${bucket}`} onClick={() => chooseBucket(bucket)}>
              {BUCKET_INFO[bucket].label}
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
        <div className="stage-actions">
          <button className="ghost" onClick={skipCurrent}>
            Skip for now <kbd>S</kbd>
          </button>
          {undoButton}
        </div>
      </div>
    );
  }

  const uniqueCount = contents ? contents.tracks.size : playlist.total;
  const done = rankedCount(data);

  return (
    <main className="ranker">
      <header className="ranker-head">
        <Cover src={playlist.image} className="head-cover" />
        <div className="head-text">
          <h1>{playlist.name}</h1>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${uniqueCount ? (done / uniqueCount) * 100 : 0}%` }} />
          </div>
          <span className="muted small">
            {done} of {uniqueCount} ranked
          </span>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={showPlayers} onChange={(e) => setShowPlayers(e.target.checked)} />
          Show players
        </label>
      </header>

      <div className="ranker-body">
        <section className="stage-col">{stage}</section>
        <aside className="side-col">
          {contents && <SavePanel me={me} playlist={playlist} data={data} reload={reload} />}
          <div className="panel">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'ranking'} onClick={() => setTab('ranking')}>
                Ranking <span>{done}</span>
              </button>
              <button role="tab" aria-selected={tab === 'unranked'} onClick={() => setTab('unranked')}>
                Unranked <span>{queue.length}</span>
              </button>
            </div>
            {tab === 'ranking' ? (
              <RankingList data={data} tracks={tracks} highlight={lastPlaced} onRerank={rerank} />
            ) : (
              <UnrankedList
                queue={queue}
                skipped={data.skipped}
                tracks={tracks}
                current={currentUri}
                onRankNext={(uri) => rankNext(uri)}
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
