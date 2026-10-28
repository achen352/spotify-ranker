import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { handleRedirect } from './spotify/auth';
import './styles.css';

// Spotify only accepts the 127.0.0.1 redirect URI, and tokens are stored per-origin,
// so always run on 127.0.0.1.
if (window.location.hostname === 'localhost') {
  window.location.replace(window.location.href.replace('//localhost', '//127.0.0.1'));
} else {
  // Finish the OAuth redirect (if this is one) before the first render.
  handleRedirect()
    .then(
      () => null,
      (err: Error) => err.message,
    )
    .then((loginError) => {
      createRoot(document.getElementById('root')!).render(
        <StrictMode>
          <App loginError={loginError} />
        </StrictMode>,
      );
    });
}
