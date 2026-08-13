/**
 * EIP-4361 ("Sign-In with Ethereum") message construction.
 *
 * Lives in @puno/shared because both sides need the byte-identical string: the
 * browser signs it, and the server rebuilds it to check the signature against.
 * If the two ever formatted it differently, every login would fail — so there
 * is exactly one builder and both import it.
 *
 * Deliberately no parser. The server never parses a message the client sent;
 * it reconstructs the expected message from values it already trusts (its own
 * domain, its own chain, the nonce it issued) and verifies the signature
 * against that. A field the client could smuggle in therefore has nowhere to
 * land, which is the failure mode most hand-rolled SIWE parsers get wrong.
 */

export interface SiweParams {
  /** Host (and port) the user is signing in to, e.g. `puno.app`. */
  domain: string;
  /** The wallet doing the signing, EIP-55 or lowercase — used verbatim. */
  address: string;
  /** Full origin, e.g. `https://puno.app`. */
  uri: string;
  chainId: number;
  /** Server-issued, single-use. */
  nonce: string;
  /** ISO-8601. Sent back with the signature so the server can rebuild this exact string. */
  issuedAt: string;
}

/** Shown in the wallet prompt. Fixed text — it is part of what gets signed. */
export const SIWE_STATEMENT =
  "Sign in to Puno. This proves you control this wallet. It does not approve any transaction, transfer, or trade.";

export function buildSiweMessage(p: SiweParams): string {
  return [
    `${p.domain} wants you to sign in with your Ethereum account:`,
    p.address,
    "",
    SIWE_STATEMENT,
    "",
    `URI: ${p.uri}`,
    "Version: 1",
    `Chain ID: ${p.chainId}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
  ].join("\n");
}

/** How long a signed message stays acceptable, to bound replay on a leaked signature. */
export const SIWE_MAX_AGE_MS = 5 * 60 * 1000;

export function isFreshIssuedAt(issuedAt: string, now = Date.now()): boolean {
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return false;
  // Allow a little clock skew forward, the full window backward.
  return t <= now + 60_000 && now - t <= SIWE_MAX_AGE_MS;
}
