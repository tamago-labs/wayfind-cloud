import outputs from '@/amplify_outputs.json';

export class BackendPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendPendingError';
  }
}

function functionUrl(): string {
  const url = (outputs as Record<string, any>)?.custom?.wayfindApi?.functionUrl;
  if (!url) {
    throw new BackendPendingError(
      'Backend not deployed yet. Deploy the Amplify backend (Phase 3), then reload — this button will work.',
    );
  }
  return url as string;
}

export function backendConfigured(): boolean {
  const o = outputs as Record<string, any>;
  return Boolean(o?.auth && o?.custom?.wayfindApi?.functionUrl);
}

/** Base URL of the API Function URL (throws BackendPendingError when missing). */
export function apiBaseUrl(): string {
  return functionUrl().replace(/\/$/, '');
}

/** Cognito bearer for API calls (throws BackendPendingError when signed out). */
export async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await idToken()}` };
}

async function idToken(): Promise<string> {
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error('no token');
    return token;
  } catch {
    throw new BackendPendingError('You need to sign in first — open /app/sign-in, then try again.');
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const base = functionUrl();
  const token = await idToken();
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `request failed (${res.status}) — if you just deployed, give it a minute and retry.`);
  }
  return body;
}

export const getMe = () => apiFetch('/me');
export const listBots = () => apiFetch('/bots');
export const createBot = (bot: { name: string; finder: string; job: string; description?: string }) =>
  apiFetch('/bots', { method: 'POST', body: JSON.stringify(bot) });
export const requestComputer = () => apiFetch('/computer/request', { method: 'POST', body: '{}' });
export const provisionComputer = () => apiFetch('/computer/provision', { method: 'POST', body: '{}' });
export const computerAction = (action: 'suspend' | 'resume' | 'terminate') =>
  apiFetch('/computer/action', { method: 'POST', body: JSON.stringify({ action }) });
export const computerToken = (expirationInMinutes = 30) =>
  apiFetch('/computer/token', { method: 'POST', body: JSON.stringify({ expirationInMinutes }) });
