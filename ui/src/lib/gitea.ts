import { invoke, isTauri } from '@tauri-apps/api/core';

/** Where the company Gitea sign-in stands. The tokens never reach the page. */
export interface GiteaStatus {
  signedIn: boolean;
  username?: string | null;
  displayName?: string | null;
  url?: string | null;
}

const none: GiteaStatus = { signedIn: false };

export async function giteaStatus(): Promise<GiteaStatus> {
  return isTauri() ? invoke<GiteaStatus>('gitea_status') : none;
}

/** Opens the browser for Gitea (and the company SSO) and resolves once the tokens are stored. */
export async function giteaLogin(): Promise<GiteaStatus> {
  if (!isTauri()) throw new Error('Gitea sign-in works in the Friday desktop app only.');
  return invoke<GiteaStatus>('gitea_login');
}

export async function giteaLogout(): Promise<GiteaStatus> {
  return isTauri() ? invoke<GiteaStatus>('gitea_logout') : none;
}
