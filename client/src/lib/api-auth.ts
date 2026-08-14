import { lsGet, lsRemove, lsSet } from "./storage";

const ACCESS_TOKEN_KEY = "ap_supabase_access_token";
const UNAUTHORIZED_EVENT = "auftragpro:api-unauthorized";
let installed = false;
let nativeFetch: typeof window.fetch | null = null;

export function getAccessToken(): string | null {
  return lsGet(ACCESS_TOKEN_KEY);
}

export function setAccessToken(accessToken: string): void {
  lsSet(ACCESS_TOKEN_KEY, accessToken);
}

export function clearAccessToken(): void {
  lsRemove(ACCESS_TOKEN_KEY);
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function isProtectedApiUrl(url: string): boolean {
  if (!url.includes("/api/")) return false;
  return !/\/api\/(auth\/login|auth\/verify-2fa|ping|public\/)/.test(url);
}

/**
 * One browser-level interceptor also covers legacy direct fetch() calls in
 * pages that download PDFs or upload files. It only adds a header while a
 * Supabase access token exists, preserving cookie-only legacy login behavior.
 */
export function installApiAuthInterceptor(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = getAccessToken();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    if (token && isProtectedApiUrl(requestUrl(input))) headers.set("Authorization", `Bearer ${token}`);

    const response = await nativeFetch!(input, { ...init, headers });
    if (response.status === 401 && isProtectedApiUrl(requestUrl(input)) && !requestUrl(input).includes("/api/super-admin/")) {
      clearAccessToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return response;
  };
}

export function onApiUnauthorized(listener: () => void): () => void {
  window.addEventListener(UNAUTHORIZED_EVENT, listener);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, listener);
}
