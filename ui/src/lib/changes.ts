import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';

/** What a chat changed in its project folder, compared with before its first request. */
export interface Changes {
  added: number;
  removed: number;
  files: number;
  /** The changed and new files (relative to the project folder), for the Outputs list. */
  names: string[];
}

const none: Changes = { added: 0, removed: 0, files: 0, names: [] };

/**
 * The chat's changes: read when it opens, every few seconds while it is working, and once more when it
 * stops (that is when the work has just been saved).
 */
export function useChanges(threadId: string | null, running: boolean): Changes {
  const [changes, setChanges] = useState<Changes>(none);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!threadId || !isTauri()) {
      setChanges(none);
      return;
    }
    let cancelled = false;
    const read = () =>
      invoke<Changes>('git_changes', { threadId })
        .then(next => !cancelled && setChanges({ ...none, ...next, names: next.names ?? [] }))
        .catch(() => undefined);
    void read();
    const timer = running ? window.setInterval(read, 4000) : undefined;
    // The work is saved to the Git server just after a request finishes; look again shortly after.
    const settle = wasRunning.current && !running ? window.setTimeout(read, 6000) : undefined;
    wasRunning.current = running;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (settle) window.clearTimeout(settle);
    };
  }, [threadId, running]);

  return changes;
}
