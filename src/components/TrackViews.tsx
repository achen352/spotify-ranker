import type { Track } from '../spotify/api';

export function Cover({ src, className }: { src: string | null; className?: string }) {
  const cls = `cover ${className ?? ''}`;
  return src ? <img className={cls} src={src} alt="" loading="lazy" /> : <div className={`${cls} cover-empty`}>♪</div>;
}

/** Spotify's embed player: full playback if you're logged in to Spotify in this browser, previews otherwise. */
export function Embed({ track }: { track: Track }) {
  return (
    <iframe
      className="embed"
      title={`Spotify player: ${track.name}`}
      src={`https://open.spotify.com/embed/${track.type}/${track.id}?utm_source=generator`}
      height="80"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  );
}

export function TrackHero({ track, showPlayer }: { track: Track; showPlayer: boolean }) {
  return (
    <div className="hero">
      <Cover src={track.image} className="hero-art" />
      <div className="hero-text">
        <span className="track-title big">{track.name}</span>
        <span className="track-sub">{track.artists}</span>
        {track.album && <span className="track-sub faint">{track.album}</span>}
      </div>
      {showPlayer && <Embed track={track} />}
    </div>
  );
}

interface ChoiceCardProps {
  track: Track;
  label: string;
  keyHint: string;
  showPlayer: boolean;
  onPick: () => void;
}

export function ChoiceCard({ track, label, keyHint, showPlayer, onPick }: ChoiceCardProps) {
  return (
    <div className="choice">
      <button className="choice-pick" onClick={onPick}>
        <Cover src={track.image} className="choice-art" />
        <span className="choice-label">{label}</span>
        <span className="track-title">{track.name}</span>
        <span className="track-sub">{track.artists}</span>
        <span className="choice-cta">
          <kbd>{keyHint}</kbd> This one
        </span>
      </button>
      {showPlayer && <Embed track={track} />}
    </div>
  );
}
