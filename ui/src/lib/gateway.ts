import { invoke, isTauri } from '@tauri-apps/api/core';

/** Who is signed in to the company LLM gateway. The key itself never reaches the page. */
export interface GatewayStatus {
  signedIn: boolean;
  username?: string | null;
  /** The person's name from SSO. Prefer it over `username` when showing who is signed in. */
  displayName?: string | null;
  expiresAt?: string | null;
  /** What the company sign-in says about the person. Absent for a sign-in made before this was kept. */
  profile?: GatewayProfile | null;
}

/** The person's details from the company sign-in (display only). Fields the directory does not send are empty. */
export interface GatewayProfile {
  name: string;
  employeeId: string;
  email: string;
  factory: string;
  section: string;
  department: string;
  groups: string[];
  roles: string[];
}

const signedOut: GatewayStatus = { signedIn: false };
/** Fired after a sign-in or sign-out so other parts of the page can re-read the status. */
export const CHANGED = 'friday:gateway-changed';

export async function gatewayStatus(): Promise<GatewayStatus> {
  return isTauri() ? invoke<GatewayStatus>('gateway_status') : signedOut;
}

interface BrowserTrust {
  available: boolean;
  trusted: boolean;
}

/**
 * Sign-in happens in the system browser, which only trusts the company certificate if Windows does.
 * Installs it for this user (no administrator rights; Windows asks the person to confirm). Never
 * blocks sign-in: if it is declined the browser just shows its usual warning.
 */
async function trustCompanyCertificate(): Promise<void> {
  try {
    const trust = await invoke<BrowserTrust>('trust_status');
    if (trust.available && !trust.trusted) await invoke<BrowserTrust>('trust_install');
  } catch {
    /* continue without it */
  }
}

/** Opens the browser for SSO and resolves once the key is stored. Rejects with a readable message. */
export async function gatewayLogin(): Promise<GatewayStatus> {
  if (!isTauri()) throw new Error('Sign-in works in the Liam desktop app only.');
  await trustCompanyCertificate();
  const status = await invoke<GatewayStatus>('gateway_login');
  window.dispatchEvent(new Event(CHANGED));
  return status;
}

export async function gatewayLogout(): Promise<GatewayStatus> {
  const status = isTauri() ? await invoke<GatewayStatus>('gateway_logout') : signedOut;
  window.dispatchEvent(new Event(CHANGED));
  return status;
}
