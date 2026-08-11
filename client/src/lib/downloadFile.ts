import { getAccessToken, setAccessToken } from "./api-auth";
import { supabase } from "./supabase";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
const DOWNLOAD_START_ERROR = "Download konnte nicht gestartet werden. Bitte auf Desktop erneut versuchen.";

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

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isCsvDownload(contentType: string | null, filename: string): boolean {
  return contentType?.toLowerCase().includes("text/csv") || filename.toLowerCase().endsWith(".csv");
}

function startAnchorDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function startIOSDownload(blob: Blob, downloadWindow: Window | null): void {
  const objectUrl = URL.createObjectURL(blob);

  if (downloadWindow) {
    downloadWindow.location.href = objectUrl;
  } else {
    // If Safari blocks the popup, retain a usable fallback in the current tab.
    window.location.href = objectUrl;
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Loads an authenticated API response into a Blob and starts a browser download.
 * The fallback token supports the legacy login flow, which persists the current
 * Supabase access token through the existing auth utility.
 *
 * On iOS, an empty tab is opened synchronously with the user's click. After the
 * authenticated request completes, that tab navigates to the Blob URL so Safari
 * can show its preview and sharing controls without losing the user gesture.
 */
export async function downloadWithAuth(url: string, filename?: string): Promise<void> {
  const downloadOnIOS = isIOS();
  let downloadWindow: Window | null = null;

  if (downloadOnIOS) {
    try {
      downloadWindow = window.open("about:blank", "_blank");
    } catch {
      // The current-tab fallback below remains available if opening a tab fails.
    }
  }

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token ?? getAccessToken();

    if (!accessToken) {
      throw new Error("Sie sind nicht angemeldet. Bitte melden Sie sich erneut an.");
    }

    if (data.session?.access_token) setAccessToken(data.session.access_token);

    const response = await fetch(resolveDownloadUrl(url), {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "omit",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await errorMessage(response));
    }

    const downloadName =
      filename ??
      filenameFromContentDisposition(response.headers.get("content-disposition")) ??
      filenameFromUrl(url);
    const responseBlob = await response.blob();
    const blob = isCsvDownload(response.headers.get("content-type"), downloadName)
      ? new Blob([responseBlob], { type: "text/csv;charset=utf-8" })
      : responseBlob;

    if (downloadOnIOS) {
      startIOSDownload(blob, downloadWindow);
    } else {
      startAnchorDownload(blob, downloadName);
    }
  } catch (error) {
    if (downloadWindow && !downloadWindow.closed) {
      downloadWindow.close();
    }

    if (error instanceof Error) throw error;
    throw new Error(DOWNLOAD_START_ERROR);
  }
}
