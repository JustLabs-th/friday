import { useState } from 'react';
import type { Page } from '@/components/layout/app-sidebar';

interface History {
  stack: Page[];
  index: number;
}

/** Which page is showing, with back / forward through the pages visited. */
export function usePageHistory(initial: Page = 'home') {
  const [history, setHistory] = useState<History>({ stack: [initial], index: 0 });

  function navigate(next: Page) {
    setHistory(current => {
      if (current.stack[current.index] === next) return current;
      // Going somewhere new drops whatever "forward" pages there were.
      const stack = [...current.stack.slice(0, current.index + 1), next];
      return { stack, index: stack.length - 1 };
    });
  }
  function goBack() {
    setHistory(current => ({ ...current, index: Math.max(0, current.index - 1) }));
  }
  function goForward() {
    setHistory(current => ({ ...current, index: Math.min(current.stack.length - 1, current.index + 1) }));
  }

  return {
    page: history.stack[history.index],
    canGoBack: history.index > 0,
    canGoForward: history.index < history.stack.length - 1,
    navigate,
    goBack,
    goForward,
  };
}
