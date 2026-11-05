import { invoke, isTauri } from '@tauri-apps/api/core';

/** Who is signed in to the company LLM gateway. The key itself never reaches the page. */
export interface GatewayStatus {
  signedIn: boolean;
  username?: string | null;
  expiresAt?: string | null;
}

const signedOut: GatewayStatus = { signedIn: false };

export async function gatewayStatus(): Promise<GatewayStatus> {
  return isTauri() ? invoke<GatewayStatus>('gateway_status') : signedOut;
}

/** Opens the browser for SSO and resolves once the key is stored. Rejects with a readable message. */
export async function gatewayLogin(): Promise<GatewayStatus> {
  if (!isTauri()) throw new Error('Sign-in works in the Friday desktop app only.');
  return invoke<GatewayStatus>('gateway_login');
}

export async function gatewayLogout(): Promise<GatewayStatus> {
  return isTauri() ? invoke<GatewayStatus>('gateway_logout') : signedOut;
}
