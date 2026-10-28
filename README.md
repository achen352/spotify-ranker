# Playlist Ranker

Rank a Spotify playlist Beli-style, then write the order back to Spotify.

For each song you pick **I like it / It's fine / Not for me**, then answer a few
"which do you prefer?" match-ups. A binary search places the song within its group, so a
playlist of 100 songs takes about 3–4 comparisons per song. Each song gets a 0–10 score
(liked songs 6.7–10, fine 3.4–6.6, not for me 0–3.3).

Runs locally at `http://127.0.0.1:5173`. It has no backend: login uses Spotify's PKCE flow,
and your progress is saved in the browser's localStorage.

## Setup

1. Go to the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app:
   - **Redirect URI:** `http://127.0.0.1:5173/callback` (Spotify rejects `localhost`)
   - **APIs used:** Web API

   Spotify's Development Mode requires the app owner to have **Spotify Premium**. If you log in
   with a different account than the one that owns the app, add that account under the
   app's **User Management** tab.
2. Copy the app's Client ID into `.env.local`:
   ```sh
   cp .env.example .env.local
   # then edit .env.local: VITE_SPOTIFY_CLIENT_ID=your_client_id
   ```
3. Install and run:
   ```sh
   npm install
   npm run dev
   ```
   Open http://127.0.0.1:5173.

## Using it

| Key | Action |
| --- | --- |
| `1` `2` `3` | I like it / It's fine / Not for me |
| `←` / `→` | Prefer the new song / the ranked one |
| `↓` or `T` | Too tough to call (puts it right below the other song) |
| `S` | Skip this song for now |
| `Z` or `Backspace` | Undo |

- **↺** next to a ranked song removes it from the ranking so you can rank it again.
- **Unranked** tab: click "Rank next" on a song to rank it out of order.
- **Show players** puts Spotify's embed player on each song. It plays full tracks if
  you're logged in to open.spotify.com in the same browser, and 30-second previews otherwise.

## Saving

- **Reorder this playlist** puts ranked songs first (best to worst), then unranked songs in
  their current order. Songs are moved in place, so "date added" and local files are kept.
  - It re-fetches the playlist from Spotify first, so songs added elsewhere in the meantime are
    accounted for.
  - Each move is one API request, so a large shuffle takes a while.
  - Nothing is ever removed. If it's interrupted, run it again and it continues from where it stopped.
- **Save as new playlist** creates a private copy in ranked order and leaves the original alone.
  Local files can't be copied.
- The first time you reorder a playlist, its original order is saved in the browser.
  **Restore original order** puts it back.

## Backing up your rankings

Rankings live in this browser's localStorage for `http://127.0.0.1:5173`, not in the project
files, so updating the code doesn't touch them. Clearing site data, or using another browser or
address, does lose them.

- **Export** in the top bar downloads all rankings and original-order backups as a JSON file.
  Login tokens are not included.
- **Import** loads such a file back, replacing saved rankings for the same playlists.

Spotify only lets apps read playlists you own or collaborate on, so other playlists you
follow aren't listed.
