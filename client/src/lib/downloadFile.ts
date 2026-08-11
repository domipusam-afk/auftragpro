import { getAccessToken, setAccessToken } from "./api-auth";
import { supabase } from "./supabase";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function resolveDownloadUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

function filenameFromContentDisposition(contentDisposition: string | null): string | undefined {
  if (!contentDisposition) return undefined;

  const encodedFilename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFilename) {
    try {
      return decodeURIComponent(encodedFilename);
    } catch {
      return encodedFilename;
    }
  }

  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
}

function filenameFromUrl(url: string): string {
  const pathname = new URL(url, window.location.origin).pathname;
  const filename = pathname.split("/").filter(Boolean).pop();
  return filename ? decodeURIComponent(filename) : "download";
}

async function errorMessage(response: Response): Promise<string> {
  const body = await response.clone().json().catch(() => null);
  if (body && typeof body === "object") {
    const message = "message" in body ? body.message : "error" in body ? body.error : null;
    if (typeof message === "string" && message.trim()) return message;
  }

  const text = (await response.text()).trim();
  return text || response.statusText || `HTTP ${response.status}`;
}

/**
 * Loads an authenticated API response into a Blob and starts a browser download.
 * The fallback token supports the legacy login flow, which persists the current
 * Supabase access token through the existing auth utility.
 */
export async function downloadWithAuth(url: string, filename?: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token ?? getAccessToken();

  if (!accessToken) {
    throw new Error("Sie sind nicht angemeldet. Bitte melden Sie sich erneut an.");
  }

  if (data.session?.access_token) setAccessToken(data.session.access_token);

  const response = await fetch(resolveDownloadUrl(url), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const downloadName =
    filename ??
    filenameFromContentDisposition(response.headers.get("content-disposition")) ??
    filenameFromUrl(url);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = downloadName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
}
