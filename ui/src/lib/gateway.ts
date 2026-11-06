import { invoke, isTauri } from '@tauri-apps/api/core';

/** Who is signed in to the company LLM gateway. The key itself never reaches the page. */
export interface GatewayStatus {
  signedIn: boolean;
  username?: string | null;
  /** The person's name from SSO. Prefer it over `username` when showing who is signed in. */
  displayName?: string | null;
  expiresAt?: string | null;
}

const signedOut: GatewayStatus = { signedIn: false };
/** Fired after a sign-in or sign-out so other parts of the page can re-read the status. */
export const CHANGED = 'friday:gateway-changed';

export async function gatewayStatus(): Promise<GatewayStatus> {
  return isTauri() ? invoke<GatewayStatus>('gateway_status') : signedOut;
}

/** Opens the browser for SSO and resolves once the key is stored. Rejects with a readable message. */
export async function gatewayLogin(): Promise<GatewayStatus> {
  if (!isTauri()) throw new Error('Sign-in works in the Friday desktop app only.');
  const status = await invoke<GatewayStatus>('gateway_login');
  window.dispatchEvent(new Event(CHANGED));
  return status;
}

export async function gatewayLogout(): Promise<GatewayStatus> {
  const status = isTauri() ? await invoke<GatewayStatus>('gateway_logout') : signedOut;
  window.dispatchEvent(new Event(CHANGED));
  return status;
}
