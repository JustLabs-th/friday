import { headers } from 'next/headers';

export type CurrentUser = {
  /** Sign-in name from the company directory (empty if nobody is signed in). */
  username: string;
  email: string;
  /** Full name as the directory has it (empty when it has none). */
  name: string;
  /** Employee code. Taken from the claim "employee_id" or "employeeId" when the directory sends one,
   *  otherwise the sign-in name (which is the employee code in this company). */
  employeeId: string;
  /** Factory the person belongs to, e.g. "fac2" (claim "factory"). Empty when the sign-in does not send it. */
  factory: string;
  /** Section, e.g. "FA" (claim "section"). Empty when not sent. */
  section: string;
  /** Department, e.g. "Digital Transformation" (claim "dept"). Empty when not sent. */
  department: string;
  /** Directory groups the person belongs to, e.g. ["FA", "llm-users"]. Short names. Mixes organisation
   *  groups (like the section) with access groups of company systems. */
  groups: string[];
  /** Realm roles, e.g. ["ai-user"] (claim realm_access.roles). Empty when not sent. */
  roles: string[];
  /** Every claim the company sign-in gave about the person (name, given_name, family_name, ...). */
  claims: Record<string, unknown>;
};

function claimsFrom(authorization: string | null): Record<string, unknown> {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const payload = token?.split('.')[1];
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Who is using the app right now.
 *
 * Every app Liam puts online sits behind the company sign-in. That sign-in passes the person in
 * request headers, so the app never handles passwords or login pages itself. The claims are read
 * from the sign-in token the same way for everyone; nothing here checks a signature, because only
 * the company sign-in can reach the app.
 * Use this in Server Components, Route Handlers and Server Actions.
 * While you run the app on your own computer (not production) there is no sign-in, so a stand-in user is returned.
 */
export async function getUser(): Promise<CurrentUser> {
  const h = await headers();
  const claims = claimsFrom(h.get('authorization'));
  const username = h.get('x-auth-request-preferred-username') ?? h.get('x-auth-request-user') ?? text(claims.preferred_username);
  if (!username && process.env.NODE_ENV !== 'production') {
    return { username: 'dev', email: 'dev@example.com', name: 'Dev User', employeeId: 'dev', factory: '', section: '', department: '', groups: [], roles: [], claims: {} };
  }
  const groups = (h.get('x-auth-request-groups') ?? '')
    .split(',')
    .map(group => group.trim())
    .filter(Boolean);
  return {
    username,
    email: h.get('x-auth-request-email') ?? text(claims.email),
    name: text(claims.name) || [text(claims.given_name), text(claims.family_name)].filter(Boolean).join(' '),
    employeeId: text(claims.employee_id) || text(claims.employeeId) || username,
    factory: text(claims.factory),
    section: text(claims.section),
    department: text(claims.dept) || text(claims.department),
    groups: groups.length ? groups : strings(claims.groups),
    roles: strings((claims.realm_access as { roles?: unknown } | undefined)?.roles),
    claims,
  };
}

/**
 * Where the company sign-in lives. Every value can be set with an environment variable (see .env.example);
 * the defaults are this company's.
 *   SSO_ISSUER     the Keycloak realm address
 *   SSO_CLIENT_ID  the Keycloak client the sign-in proxy uses
 *   AUTH_URL       the sign-in proxy's address; when empty it is "auth." in front of the app's parent domain
 */
function ssoSettings() {
  return {
    issuer: (process.env.SSO_ISSUER ?? 'https://sso.digitalx.srt/auth/realms/srt').replace(/\/$/, ''),
    clientId: process.env.SSO_CLIENT_ID ?? 'liam-apps',
    authUrl: (process.env.AUTH_URL ?? '').replace(/\/$/, ''),
  };
}

/**
 * The address that signs the person out of the company sign-in (null when running on your own computer).
 * It clears this app's sign-in, then the company directory's, and ends on the sign-in page.
 */
export async function signOutUrl(): Promise<string | null> {
  const where = await locate();
  if (!where) return null;
  const { auth, proto, host } = where;
  // after the company sign-out, the sign-in page takes the person back to this app once they sign in again
  const back = `${auth}/oauth2/sign_in?rd=${encodeURIComponent(`${proto}://${host}/`)}`;
  const sso = ssoSettings();
  const company = `${sso.issuer}/protocol/openid-connect/logout?client_id=${encodeURIComponent(sso.clientId)}&post_logout_redirect_uri=${encodeURIComponent(back)}`;
  return `${auth}/oauth2/sign_out?rd=${encodeURIComponent(company)}`;
}

/** The address that starts the company sign-in and brings the person back to this app (null on your own computer). */
export async function signInUrl(): Promise<string | null> {
  const where = await locate();
  return where ? `${where.auth}/oauth2/start?rd=${encodeURIComponent(`${where.proto}://${where.host}/`)}` : null;
}

async function locate(): Promise<{ auth: string; proto: string; host: string } | null> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0];
  const proto = (h.get('x-forwarded-proto') ?? 'http').split(',')[0].trim();
  const parent = host.split('.').slice(1).join('.');
  const auth = ssoSettings().authUrl || (parent.includes('.') ? `${proto}://auth.${parent}` : '');
  return auth ? { auth, proto, host } : null;
}

export function isInGroup(user: CurrentUser, group: string): boolean {
  return user.groups.includes(group);
}
