import { DEFAULT_NETWORK, getNetwork, getNetworkByChainId } from "@puno/shared";

/**
 * Which chain id the browser puts in the message it asks the wallet to sign.
 *
 * The wallet's real chain when it is one we run, otherwise the default. Falling
 * back rather than refusing is deliberate: signing in is a read gate, not a
 * transaction, and demanding a chain switch before someone can even look at
 * their dashboard would be a worse product for no security gain.
 */
export function siweChainIdForWallet(walletChainId: number | undefined): number {
  if (walletChainId !== undefined && getNetworkByChainId(walletChainId)) return walletChainId;
  return getNetwork(DEFAULT_NETWORK).chainId;
}

/**
 * Which chain id the server rebuilds the message with. `null` refuses the
 * request.
 *
 * The session used to be pinned: the server always rebuilt with testnet's chain
 * id, so a signature produced by a wallet on mainnet could not verify. That
 * breaks the journey the product is built around — take the free run on testnet,
 * then create a paid vault on mainnet — right in the middle.
 *
 * Accepting either of our chains does not weaken anything. The properties that
 * make this safe are elsewhere and unchanged: `domain` and `uri` come from the
 * request URL and never from the body, which is what makes a signature harvested
 * on another site useless here; the `nonce` is the single-use one the server put
 * in an httpOnly cookie; the address is the recovery target. All this widens is
 * the accepted-message set from one string to two, both still requiring a
 * signature from the claimed address over the server's own nonce and origin.
 *
 * **The type check is not a formality.** `buildSiweMessage` joins its fields
 * into a newline-delimited string, so a `chainId` of
 * `"1\nURI: https://evil.example"` arriving as a *string* would let a caller
 * append lines to the very message the server verifies against. Validating that
 * it is an integer is what closes that, and `getNetworkByChainId` then keeps the
 * accepted set finite and enumerable.
 *
 * A missing `chainId` falls back to the default rather than failing, so a stale
 * tab posting the old body shape still verifies against what it actually signed.
 */
export function resolveSiweChainId(claimed: unknown): number | null {
  if (claimed === undefined || claimed === null) return getNetwork(DEFAULT_NETWORK).chainId;
  if (typeof claimed !== "number" || !Number.isInteger(claimed)) return null;
  return getNetworkByChainId(claimed) ? claimed : null;
}
