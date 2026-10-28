import { useRef } from 'react';
import { exportRankings, importRankings, parseRankingsFile } from '../storage';

function downloadExport() {
  const url = URL.createObjectURL(new Blob([exportRankings()], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ranker-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(file: File) {
  try {
    const entries = parseRankingsFile(await file.text());
    const playlists = entries.filter(([key]) => key.startsWith('ranker:ranking:')).length;
    const ok = window.confirm(
      `Import rankings for ${playlists} playlist${playlists === 1 ? '' : 's'} from ${file.name}? ` +
        'Saved rankings for the same playlists in this browser will be replaced.',
    );
    if (!ok) return;
    importRankings(entries);
    window.location.reload();
  } catch (err) {
    window.alert(`Import failed: ${err instanceof Error ? err.message : err}`);
  }
}

export function ExportImport() {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="ghost" title="Download all your rankings as a JSON file" onClick={downloadExport}>
        Export
      </button>
      <button className="ghost" title="Load rankings from an exported JSON file" onClick={() => fileInput.current?.click()}>
        Import
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) importFile(file);
        }}
      />
    </>
  );
}
