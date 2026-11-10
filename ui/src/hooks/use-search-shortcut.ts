import { useEffect, type Dispatch, type SetStateAction } from 'react';

/** Ctrl+K (Cmd+K on macOS) toggles the search from anywhere. */
export function useSearchShortcut(setSearchOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(open => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen]);
}
