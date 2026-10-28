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

- **Reorder this playlist** overwrites the playlist with ranked songs first (best to worst),
  then unranked songs in their current order. Before writing, the app re-fetches the playlist
  from Spotify, so songs added elsewhere in the meantime are kept.
- **Save as new playlist** creates a private copy in ranked order and leaves the original alone.
- The first time you overwrite a playlist, its original order is saved in the browser.
  **Restore original order** puts it back.

Caveats of overwriting, which come from Spotify's API:
- Every song's "date added" becomes today.
- Local files can't be re-added through the API, so they're dropped (the app warns you first).

Spotify only lets apps read playlists you own or collaborate on, so other playlists you
follow aren't listed.
