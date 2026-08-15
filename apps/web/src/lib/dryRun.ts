/**
 * Reading paper-vs-live out of a request body.
 *
 * One column, two routes, and deliberately different strictness — which is
 * exactly why it lives here rather than as a expression in each handler. The
 * two rules are only defensible next to each other.
 *
 * Every path errs toward paper. The failure modes are not symmetric: reading a
 * malformed body as paper costs the user a tick that did not settle, and
 * reading it as live spends their money on a trade they never authorised.
 */

/**
 * Creation. The field is optional, so absence has to mean something, and it
 * means paper: an unspecified new agent is the one case where a safe default is
 * available and obviously right.
 *
 * Anything that is not literally `false` lands on paper — `undefined`, `null`,
 * the string `"false"` from a hand-rolled client that forgot to JSON-encode a
 * boolean. Only an actual `false` asks for live.
 */
export function dryRunFromCreateBody(value: unknown): boolean {
  return value !== false;
}

/**
 * Updating an existing agent. Strict, and `null` means reject the request.
 *
 * There is no safe default here because there is nothing to default *to*: the
 * agent already has a mode, and a caller sending an unreadable value is a
 * caller who disagrees with the server about what is being asked. Silently
 * writing paper would be as wrong as silently writing live — it would flip a
 * live agent off on a typo. Refuse and say so.
 */
export function dryRunFromPatchBody(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
