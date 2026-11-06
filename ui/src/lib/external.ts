import type { MouseEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

// A desktop webview does not open target="_blank" links, so hand them to the system browser.
// In a plain browser the link works as usual.
// A link to a file on this computer (a page the agent just built) opens through Liam, which only opens
// documents and media; the web opener would refuse it.
const LOCAL_FILE = /^(file:\/\/|\/?[A-Za-z]:[\\/])/;

export function openExternally(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!isTauri()) return;
  event.preventDefault();
  if (LOCAL_FILE.test(url)) {
    void invoke('open_local_file', { path: url }).catch(() => undefined);
    return;
  }
  void openUrl(url);
}
