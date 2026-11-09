import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

/** The Liam engine's version number, read once the engine is connected. Undefined until then (or in the browser preview). */
export function useEngineVersion(ready: boolean): string | undefined {
  const [version, setVersion] = useState<string>();
  useEffect(() => {
    if (!ready || !isTauri() || version) return;
    void invoke<string>('engine_version').then(setVersion, () => undefined);
  }, [ready, version]);
  return version;
}
