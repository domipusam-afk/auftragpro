import { getAccessToken, setAccessToken } from "./api-auth";
import { supabase } from "./supabase";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function resolveDownloadUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
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
 * Requests a short-lived server-signed URL, then leaves file delivery to the
 * browser's normal HTTP download flow. This avoids Blob URL context boundaries
 * that make cross-window downloads unreliable in iOS Safari.
 */
export async function downloadWithAuth(url: string, filename?: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token ?? getAccessToken();
  if (!accessToken) {
    throw new Error("Sie sind nicht angemeldet. Bitte melden Sie sich erneut an.");
  }

  if (data.session?.access_token) setAccessToken(data.session.access_token);

  const response = await fetch(resolveDownloadUrl("/api/downloads/sign"), {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: url }),
  });

  if (!response.ok) throw new Error(await errorMessage(response));

  const body = await response.json().catch(() => null);
  if (!body || typeof body.downloadUrl !== "string" || !body.downloadUrl) {
    throw new Error("Download konnte nicht vorbereitet werden.");
  }

  const anchor = document.createElement("a");
  anchor.href = resolveDownloadUrl(body.downloadUrl);
  if (filename) anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
