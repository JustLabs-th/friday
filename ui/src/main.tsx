import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './style.css';

// Open http://127.0.0.1:5173/#gallery to review every component and its states.
// It is a developer tool, so it is left out of production builds (the check is a build-time constant).
const Gallery = import.meta.env.DEV
  ? lazy(() => import('./components/gallery').then(module => ({ default: module.Gallery })))
  : null;

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  if (Gallery && hash === '#gallery') {
    return (
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
