import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { Gallery } from './components/gallery';
import './style.css';

// Open http://127.0.0.1:5173/#gallery to review every component and its states.
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return hash === '#gallery' ? <Gallery /> : <App />;
}

createRoot(document.getElementById('app')!).render(<StrictMode><Root /></StrictMode>);
