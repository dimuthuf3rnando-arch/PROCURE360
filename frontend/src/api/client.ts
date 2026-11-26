const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';
export const TOKEN_KEY = 'procure360.token';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export type QueryValue = string | number | boolean | null | undefined;

export function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getStoredToken();
  const useAuth = options.auth !== false;
  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body,
    signal: options.signal,
  });

  if (response.status === 401 && path !== '/auth/login') {
    window.dispatchEvent(new CustomEvent('procure360:unauthorized'));
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : typeof payload === 'string' && payload
          ? payload
          : `Request failed with status ${response.status}.`;
    const code =
      payload && typeof payload === 'object' && 'code' in payload
        ? String((payload as { code: unknown }).code)
        : undefined;
    const details =
      payload && typeof payload === 'object' && 'details' in payload
        ? (payload as { details: unknown }).details
        : undefined;
    throw new ApiError(detail, response.status, code, details);
  }

  return payload as T;
}

export const api = {
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>('GET', path, { signal });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, { body });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PATCH', path, { body });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },
  async download(path: string, fallbackName: string): Promise<void> {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let message = `Download failed (${response.status}).`;
      try {
        const payload = await response.json();
        if (payload?.detail) message = String(payload.detail);
      } catch {
        /* ignore */
      }
      throw new ApiError(message, response.status);
    }
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || fallbackName;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  },
};
