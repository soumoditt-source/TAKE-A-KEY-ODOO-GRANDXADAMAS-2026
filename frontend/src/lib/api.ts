const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

interface ApiOptions extends RequestInit {
  token?: string | null;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, headers, ...request } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...request,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export { API_BASE };
