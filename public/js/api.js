// Thin fetch wrapper for the VeriFi REST API. Auth rides on an httpOnly JWT cookie,
// so the token is never exposed to page scripts.

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error — is the server running?');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.details);
  return data;
}

let mePromise;
export function getMe() {
  if (!mePromise) {
    mePromise = api('/auth/me')
      .then((d) => d.user)
      .catch(() => null);
  }
  return mePromise;
}

export async function requireUser() {
  const user = await getMe();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/login.html?next=${next}`);
    return new Promise(() => {}); // halt the page while redirecting
  }
  return user;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/';
}

let schemaPromise;
export function getSchema() {
  if (!schemaPromise) schemaPromise = api('/engine/schema');
  return schemaPromise;
}
