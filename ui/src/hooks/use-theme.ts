import { useCallback, useEffect, useState } from 'react';

/** Light, dark, or whatever the computer is set to. */
export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'liam-theme';

function read(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* storage unavailable: use the default */
  }
  return 'system';
}

/** Puts the theme on <html> (the page's colors switch on the class "dark"). */
function apply(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

// Before the first screen is drawn, so the app does not start light and then flip.
if (typeof window !== 'undefined') apply(read());

/** The chosen theme, kept between runs; "system" follows the computer while the app is open. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(read);

  useEffect(() => {
    apply(mode);
    if (mode !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => apply('system');
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [mode]);

  const choose = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* not kept; still applied for this run */
    }
    setMode(next);
  }, []);

  return { mode, choose };
}
