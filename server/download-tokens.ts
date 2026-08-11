import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 60;
const TOKEN_VERSION = 1;
const usedTokenIds = new Map<string, number>();
const developmentDownloadTokenSecret = randomBytes(32).toString("base64url");
let warnedAboutEphemeralSecret = false;

export interface DownloadTokenClaims {
  readonly v: number;
  readonly sub: string;
  readonly tenant: string;
  readonly path: string;
  readonly exp: number;
  readonly jti: string;
}

export interface DownloadTokenInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly path: string;
}

export type DownloadTokenValidation =
  | { readonly ok: true; readonly claims: DownloadTokenClaims }
  | { readonly ok: false; readonly message: string };

function resolveSecret(): string {
  const configured = process.env.DOWNLOAD_TOKEN_SECRET?.trim() || process.env.LEGACY_SESSION_SECRET?.trim();
  if (configured) return configured;

  if (!warnedAboutEphemeralSecret) {
    warnedAboutEphemeralSecret = true;
    console.warn(
      "[DOWNLOAD_TOKENS] DOWNLOAD_TOKEN_SECRET bzw. LEGACY_SESSION_SECRET fehlt. "
      + "Download-Tokens werden beim Server-Neustart ungültig.",
    );
  }
  return developmentDownloadTokenSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", resolveSecret()).update(payload).digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function cleanUpUsedTokens(nowSeconds: number): void {
  for (const [tokenId, expiresAt] of Array.from(usedTokenIds.entries())) {
    if (expiresAt <= nowSeconds) usedTokenIds.delete(tokenId);
  }
}

function isClaims(value: unknown): value is DownloadTokenClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return claims.v === TOKEN_VERSION
    && typeof claims.sub === "string" && claims.sub.length > 0
    && typeof claims.tenant === "string" && claims.tenant.length > 0
    && typeof claims.path === "string" && claims.path.startsWith("/")
    && typeof claims.exp === "number" && Number.isFinite(claims.exp)
    && typeof claims.jti === "string" && claims.jti.length > 0;
}

export function createDownloadToken(input: DownloadTokenInput): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  cleanUpUsedTokens(nowSeconds);
  const claims: DownloadTokenClaims = {
    v: TOKEN_VERSION,
    sub: input.userId,
    tenant: input.tenantId,
    path: input.path,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
    jti: randomBytes(18).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function validateAndConsumeDownloadToken(token: unknown): DownloadTokenValidation {
  if (typeof token !== "string" || !token) {
    return { ok: false, message: "Download-Token fehlt." };
  }

  const [payload, suppliedSignature, ...unexpectedParts] = token.split(".");
  if (!payload || !suppliedSignature || unexpectedParts.length > 0 || !signaturesMatch(suppliedSignature, sign(payload))) {
    return { ok: false, message: "Download-Token ist ungültig." };
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, message: "Download-Token ist ungültig." };
  }

  if (!isClaims(claims)) {
    return { ok: false, message: "Download-Token ist ungültig." };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  cleanUpUsedTokens(nowSeconds);
  if (claims.exp <= nowSeconds) {
    return { ok: false, message: "Download-Token ist abgelaufen. Bitte den Download erneut starten." };
  }
  if (usedTokenIds.has(claims.jti)) {
    return { ok: false, message: "Download-Token wurde bereits verwendet. Bitte den Download erneut starten." };
  }

  usedTokenIds.set(claims.jti, claims.exp);
  return { ok: true, claims };
}

export const DOWNLOAD_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;
