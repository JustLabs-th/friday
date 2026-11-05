import type { MouseEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

// A desktop webview does not open target="_blank" links, so hand them to the system browser.
// In a plain browser the link works as usual.
export function openExternally(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!isTauri()) return;
  event.preventDefault();
  void openUrl(url);
}
