import { MESSAGES, type ApiErrorBody } from '@digitalycloud/shared';

/** Base URL of the versioned API, e.g. `https://api.cloud.digitaly.fr/v1`. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1').replace(/\/+$/, '');

/** Error thrown for every failed request. `message` is the server's user-facing text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (e: unknown, code?: string): e is ApiError => e instanceof ApiError && (code === undefined || e.code === code);
export const errorMessage = (e: unknown, fallback: string = MESSAGES.internal) => (e instanceof Error && e.message ? e.message : fallback);

/** Window events the providers listen to. */
export const UNAUTHENTICATED_EVENT = 'dgc:unauthenticated';
export const TEAM_UNAVAILABLE_EVENT = 'dgc:team-unavailable';

// ---------------------------------------------------------------------------------------------
// Team scope. Each tab works in one team (sent as `X-Team-Id`), so two tabs can show two teams.

let teamId: string | null = null;
export const setRequestTeam = (id: string | null) => {
  teamId = id;
};
export const requestTeam = () => teamId;

/** URL for browser navigations and EventSource, which cannot send headers (`?team=` scopes GETs). */
export function apiUrl(path: string, params: Record<string, string | number | undefined | null> = {}, scoped = true) {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  if (scoped && teamId) url.searchParams.set('team', teamId);
  return url.toString();
}

export const query = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ---------------------------------------------------------------------------------------------
// CSRF: unsafe requests carry `X-CSRF-Token`, bound to the API's HttpOnly `dgc_csrf` cookie.

let csrf: Promise<string> | null = null;
function csrfToken(refresh = false) {
  if (refresh || !csrf) {
    csrf = fetch(`${API_URL}/auth/csrf`, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new ApiError(res.status, 'CSRF_UNAVAILABLE', MESSAGES.internal);
        return ((await res.json()) as { csrfToken: string }).csrfToken;
      })
      .catch((e: unknown) => {
        csrf = null;
        throw e instanceof ApiError ? e : networkError();
      });
  }
  return csrf;
}

const networkError = () => new ApiError(0, 'NETWORK', 'Could not reach DIGITALYCloud. Check your connection and try again.');

function toError(status: number, json: unknown, path: string) {
  const e = ((json as ApiErrorBody | null)?.error ?? {}) as Partial<ApiErrorBody['error']>;
  const { code = status === 429 ? 'RATE_LIMITED' : 'INTERNAL', message = MESSAGES.internal, fields = {}, ...details } = e;
  if (typeof window !== 'undefined') {
    if (status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    if (status === 403 && code === 'TEAM_UNAVAILABLE') window.dispatchEvent(new Event(TEAM_UNAVAILABLE_EVENT));
  }
  return new ApiError(status, code, message, fields, details);
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Send the tab's team (default). Account-level endpoints ignore it anyway. */
  scoped?: boolean;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE.has(method)) headers['X-CSRF-Token'] = await csrfToken();
  if (teamId && opts.scoped !== false) headers['X-Team-Id'] = teamId;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw networkError();
  }
  // 204 and some 202 answers (contact form, account deletion) have no body.
  const text = res.status === 204 ? '' : await res.text().catch(() => '');
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page from a proxy */
  }
  if (res.ok && !text) return undefined as T;
  if (!res.ok) {
    // The CSRF cookie can expire or be cleared; fetch a fresh token once and retry.
    if (res.status === 403 && (json as ApiErrorBody | null)?.error?.code === 'CSRF_TOKEN_INVALID' && !retried) {
      await csrfToken(true);
      return request<T>(method, path, opts, true);
    }
    throw toError(res.status, json, path);
  }
  return json as T;
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  // `{}` keeps every write a JSON request (CORS preflight + CSRF header).
  post: <T>(path: string, body: unknown = {}, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  del: <T = void>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('DELETE', path, { ...opts, body }),
};

/** Multipart upload with progress (fetch cannot report upload progress). */
export function uploadFile<T>(path: string, file: File, opts: { fields?: Record<string, string>; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<T> {
  const send = async (retried: boolean): Promise<T> => {
    const token = await csrfToken(retried);
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}${path}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-CSRF-Token', token);
      xhr.setRequestHeader('Accept', 'application/json');
      if (teamId) xhr.setRequestHeader('X-Team-Id', teamId);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
      };
      xhr.onerror = () => reject(networkError());
      xhr.onabort = () => reject(new DOMException('Upload canceled', 'AbortError'));
      xhr.onload = () => {
        let json: unknown = null;
        try {
          json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          /* non-JSON error page */
        }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(json as T);
        if (xhr.status === 403 && (json as ApiErrorBody | null)?.error?.code === 'CSRF_TOKEN_INVALID' && !retried) return resolve(send(true));
        reject(toError(xhr.status, json, path));
      };
      opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      const form = new FormData();
      // Fields first: the server reads them before the file stream.
      for (const [k, v] of Object.entries(opts.fields ?? {})) form.append(k, v);
      form.append('file', file);
      xhr.send(form);
    });
  };
  return send(false);
}
