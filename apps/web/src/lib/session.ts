import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed session cookies for wallet-based login.
 *
 * Not JWT: the only claim is "this address proved control at time T", so a
 * signed payload is the whole requirement and a JWT library's algorithm
 * negotiation would be surface with no benefit. HMAC-SHA256 over a
 * base64url payload, compared in constant time.
 *
 * SESSION_SECRET is separate from ENCRYPTION_KEY on purpose — one signs
 * cookies that leave the server, the other encrypts user API keys at rest.
 * Rotating or leaking one must not implicate the other.
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = "puno_session";
export const NONCE_COOKIE = "puno_nonce";
/** Short: the nonce only has to survive the round trip to the wallet prompt. */
export const NONCE_TTL_SECONDS = 10 * 60;

interface SessionPayload {
  /** Lowercased wallet address. */
  a: string;
  /** Issued-at, epoch ms. */
  t: number;
}

function getSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is required (32+ chars) to sign login sessions — see .env.example",
    );
  }
  return Buffer.from(secret, "utf8");
}

const b64url = (b: Buffer): string => b.toString("base64url");

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(address: string): string {
  const payload: SessionPayload = { a: address.toLowerCase(), t: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
}

/**
 * Returns the address a token vouches for, or null for anything that fails —
 * bad shape, bad signature, or expired. Callers get one answer to check, so
 * there is no path where a malformed token is mistaken for an absent one.
 */
export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = Buffer.from(sign(body), "utf8");
  const given = Buffer.from(mac, "utf8");
  // timingSafeEqual throws on length mismatch, which is itself a rejection.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.a !== "string" || typeof payload.t !== "number") return null;
  if (Date.now() - payload.t > SESSION_TTL_MS) return null;
  return payload.a;
}

export function createNonce(): string {
  return randomBytes(16).toString("hex");
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
} as const;

export const nonceCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: NONCE_TTL_SECONDS,
} as const;
