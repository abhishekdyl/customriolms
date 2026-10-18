/**
 * Typed fetch wrapper — every request goes through here so that
 * auth-header injection, base URL, and error shape are handled
 * once, not copy-pasted into every hook.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

/** For the rare request that can't carry an Authorization header — e.g. an
 * <iframe src=...> navigation, like the SCORM player — and has to pass the
 * token in the URL instead. Never use this where a header is an option. */
export function getAccessTokenForUrl(): string | null {
  return getToken();
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // response wasn't JSON — keep the statusText
    }

    if (res.status === 401 && typeof window !== "undefined") {
      // Token expired, or this session got logged out elsewhere (e.g.
      // evicted for going over the concurrent-session limit). Clear the
      // stale token and bounce to login rather than leaving the page
      // stuck on a failed request.
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  // For multipart file uploads (e.g. the bulk-invite CSV) — no Content-Type
  // here, so the browser can set its own with the multipart boundary.
  upload: <T>(path: string, formData: FormData) => {
    const token = getToken();
    return fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = await res.json();
          detail = body.detail || detail;
        } catch {
          // not JSON — keep statusText
        }
        throw new ApiError(detail, res.status);
      }
      return res.json() as Promise<T>;
    });
  },
  // For downloading a binary response (e.g. the Aiken picture-question
  // sample .zip) from an authenticated endpoint — a plain <a href> can't
  // carry the Authorization header, so this fetches it here and saves it
  // via a throwaway object URL instead.
  download: async (path: string, filename: string) => {
    const token = getToken();
    const res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.statusText, res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
