import type { TokenPrice } from "@puno/shared";

/// The predicates behind `preflight`, with no I/O.
///
/// Split from `run.ts` for the same reason as `rate-input.ts` from
/// `set-rate.ts`: the interesting part of a readiness check is what counts as
/// ready, and that has to be testable without a chain and a database. Every
/// function here takes readings and returns a row — nothing fetches.
///
/// **Four statuses, and the fourth is the point of the file.** "Could not check"
/// and "does not exist on this network" are different answers that a two-state
/// green/red table collapses into the same silence, and the state this command
/// exists to catch is the first one. So `skip` means we failed to find out and
/// blocks a green verdict, while `na` means there is genuinely nothing there yet
/// — mainnet has no PUNO, testnet has no cold wallet — and does not. `na` is
/// still printed and still counted in the headline, because "green, having
/// checked half of it" is a sentence the reader has to see whole.

export type CheckStatus = "pass" | "fail" | "skip" | "na";

export interface CheckRow {
  /// Short label for the table's first column.
  name: string;
  status: CheckStatus;
  /// What was actually read, or why the check could not run. Read by a human at
  /// the moment of a deploy, so it names values rather than describing them.
  detail: string;
}

/// Addresses that must never appear in anything this project touches again.
///
/// The first is the pre-reinstall deployer, whose key is compromised; the second
/// is the clipboard hijacker's, which received 0.000363 ETH on 2026-08-13. Both
/// are in CLAUDE.md under the security incident, and the rule there is to stop
/// if either shows up in a deploy.
///
/// This is a machine check rather than a note because the original attack
/// substituted an address *on copy*. A human comparing what they pasted against
/// what they meant to paste is comparing two copies of the same substituted
/// string. Only something that never touched the clipboard can tell.
export const BANNED_ADDRESSES: readonly string[] = [
  "0x81FDDF1dAD8ED65fA60bF1F4B89A3FA5F5B829D2",
  "0xeB73130796f89e2df501526663e1cD114eAC20Ab",
];

/// Gas floor for an address that has to keep paying for transactions.
///
/// 0.001 ETH, roughly ten times the entire testnet deploy (0.0001124 ETH
/// measured) and therefore a great many `executeTrade` calls. The number is a
/// "not nearly empty" line rather than a runway estimate: an address at zero
/// cannot act at all, and that is the failure worth seeing before it happens
/// rather than at the first trade.
export const MIN_GAS_WEI = 10n ** 15n;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/// Addresses arrive from a config file, a JSON-RPC response and an env var, and
/// the three do not agree on checksum casing. Comparing them as written is how a
/// correct address reports as a mismatch.
function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// Is there a contract at an address we have written down as holding one?
///
/// The cheapest check here and the one that catches the most: a config entry
/// pointing at an address with no code is what a typo, a wrong network, and a
/// redeploy nobody recorded all look like.
export function checkBytecode(
  name: string,
  address: string | null,
  hasCode: boolean | null,
): CheckRow {
  if (address === null) {
    return { name, status: "na", detail: "not deployed on this network (config holds null)" };
  }
  if (hasCode === null) {
    return { name, status: "skip", detail: `${short(address)} — code unreadable, RPC failed` };
  }
  if (!hasCode) {
    return { name, status: "fail", detail: `${short(address)} has no bytecode — nothing there` };
  }
  return { name, status: "pass", detail: `${short(address)} has code` };
}

/// `PunoCredits.token()` must be the PUNO the rest of the system prices.
///
/// The field is immutable, so a mismatch is not a setting to correct — it means
/// the billing contract charges for a different asset than the one the top-up
/// card asks users to send, and the only remedy is a redeploy.
export function checkCreditsToken(input: {
  credits: string | null;
  configuredToken: string | null;
  onChainToken: string | null;
}): CheckRow {
  const name = "PunoCredits.token";
  const { credits, configuredToken, onChainToken } = input;

  if (credits === null) return { name, status: "na", detail: "no PunoCredits on this network" };
  if (onChainToken === null) {
    return { name, status: "skip", detail: "token() unreadable, RPC failed" };
  }
  if (configuredToken === null) {
    return {
      name,
      status: "fail",
      detail: `contract holds ${short(onChainToken)} but config punoToken is null — billing cannot value a deposit`,
    };
  }
  if (!sameAddress(configuredToken, onChainToken)) {
    return {
      name,
      status: "fail",
      detail: `contract holds ${short(onChainToken)}, config says ${short(configuredToken)} — immutable, needs a redeploy`,
    };
  }
  return { name, status: "pass", detail: `${short(onChainToken)}, matches config` };
}

/// `punoDecimals` against the token's own `decimals()`.
///
/// The highest-consequence row in the table. The config value is what every
/// conversion multiplies by, nothing else in the system ever calls `decimals()`,
/// and a token launched with 9 instead of 18 credits every depositor a billion
/// times wrong — silently, in the direction of giving the service away, starting
/// with the first real deposit.
export function checkTokenDecimals(input: {
  token: string | null;
  configured: number;
  onChain: number | null;
}): CheckRow {
  const name = "punoToken.decimals";
  const { token, configured, onChain } = input;

  if (token === null) return { name, status: "na", detail: "no PUNO token on this network" };
  if (onChain === null)
    return { name, status: "skip", detail: "decimals() unreadable, RPC failed" };
  if (configured !== onChain) {
    const factor = 10 ** Math.abs(configured - onChain);
    return {
      name,
      status: "fail",
      detail: `chain says ${onChain}, config punoDecimals says ${configured} — every deposit off by ${factor.toLocaleString("en-US")}×`,
    };
  }
  return { name, status: "pass", detail: `${onChain}, matches punoDecimals` };
}

/// Has control of `PunoCredits` actually left the deploying key?
///
/// `Ownable2Step` makes this two events and only the second moves anything:
/// `transferOwnership` names a pending owner, and the hot key keeps full control
/// until that address calls `acceptOwnership` itself. A deploy log showing the
/// transfer proves nothing, which is why both halves are read from chain.
///
/// Testnet returns `na` rather than passing or failing: there is no cold wallet
/// there and no real money behind it, so the requirement belongs where value
/// moves — the same reasoning that keeps `EQUITY_STALENESS` strict while
/// `QUOTE_STALENESS` is loose.
export function checkOwnership(input: {
  credits: string | null;
  owner: string | null;
  pendingOwner: string | null;
  expectedOwner: string | null;
  isTestnet: boolean;
}): CheckRow {
  const name = "PunoCredits.owner";
  const { credits, owner, pendingOwner, expectedOwner, isTestnet } = input;

  if (credits === null) return { name, status: "na", detail: "no PunoCredits on this network" };
  if (owner === null) return { name, status: "skip", detail: "owner() unreadable, RPC failed" };

  if (pendingOwner !== null && !sameAddress(pendingOwner, ZERO_ADDRESS)) {
    return {
      name,
      status: isTestnet ? "na" : "fail",
      detail:
        `handover incomplete — ${short(owner)} still owns it and ${short(pendingOwner)} has not ` +
        `called acceptOwnership(). Until it does, the hot key can move the treasury`,
    };
  }
  if (expectedOwner === null) {
    return {
      name,
      status: isTestnet ? "na" : "fail",
      detail: isTestnet
        ? `${short(owner)} — no cold wallet expected on testnet`
        : `owner is ${short(owner)}; set PUNO_OWNER to the cold wallet so this can be checked`,
    };
  }
  if (!sameAddress(owner, expectedOwner)) {
    return {
      name,
      status: "fail",
      detail: `owner is ${short(owner)}, PUNO_OWNER expects ${short(expectedOwner)}`,
    };
  }
  return { name, status: "pass", detail: `${short(owner)}, handover accepted` };
}

/// The treasury must be neither the deployer nor the owner.
///
/// Two reasons, both learned by execution. `PunoCredits.deposit` reverts when the
/// payer is the treasury — self-transfer means a zero balance delta and
/// `require(received > 0)` fires — so a treasury equal to the deployer makes the
/// billing path untestable, which is what `DeployTestnet` shipped on 2026-08-14.
/// And a treasury equal to the owner puts "receives every payment" and "can
/// redirect every payment" behind one key.
export function checkTreasury(input: {
  credits: string | null;
  treasury: string | null;
  deployer: string | null;
  owner: string | null;
}): CheckRow {
  const name = "PunoCredits.treasury";
  const { credits, treasury, deployer, owner } = input;

  if (credits === null) return { name, status: "na", detail: "no PunoCredits on this network" };
  if (treasury === null)
    return { name, status: "skip", detail: "treasury() unreadable, RPC failed" };
  if (sameAddress(treasury, ZERO_ADDRESS)) {
    return { name, status: "fail", detail: "treasury is the zero address" };
  }
  if (sameAddress(treasury, deployer)) {
    return {
      name,
      status: "fail",
      detail: `treasury equals the deployer (${short(treasury)}) — deposits from it revert`,
    };
  }
  if (sameAddress(treasury, owner)) {
    return {
      name,
      status: "fail",
      detail: `treasury equals the owner (${short(treasury)}) — one key both receives and redirects`,
    };
  }
  if (deployer === null) {
    return {
      name,
      status: "skip",
      detail: `${short(treasury)}; set DEPLOYER_ADDRESS to prove it is not the deploying key`,
    };
  }
  return { name, status: "pass", detail: `${short(treasury)}, distinct from deployer and owner` };
}

/// `VaultFactory.quoteToken()` must be the USDG every vault denominates in.
export function checkQuoteToken(input: {
  factory: string | null;
  configuredUsdg: string;
  onChain: string | null;
}): CheckRow {
  const name = "VaultFactory.quoteToken";
  const { factory, configuredUsdg, onChain } = input;

  if (factory === null) return { name, status: "na", detail: "no VaultFactory on this network" };
  if (onChain === null)
    return { name, status: "skip", detail: "quoteToken() unreadable, RPC failed" };
  if (!sameAddress(configuredUsdg, onChain)) {
    return {
      name,
      status: "fail",
      detail: `factory quotes ${short(onChain)}, config USDG is ${short(configuredUsdg)}`,
    };
  }
  return { name, status: "pass", detail: `${short(onChain)}, matches config USDG` };
}

/// Six decimals, and truncated rather than rounded.
///
/// `toFixed` rounds, which let a balance one wei under the floor print as
/// "holds 0.001000 ETH, under the 0.001 floor" — a message that contradicts
/// itself in the one place a reader is deciding whether to top an address up.
/// Rounding a balance up is wrong in every direction here, so this floors.
function formatEth(wei: bigint): string {
  const millionths = wei / 10n ** 12n;
  return (Number(millionths) / 1e6).toFixed(6);
}

/// Can an address that has to pay for transactions still pay for them?
export function checkGas(
  name: string,
  address: string | null,
  wei: bigint | null,
  minWei: bigint = MIN_GAS_WEI,
): CheckRow {
  if (address === null) return { name, status: "na", detail: "no such address on this network" };
  if (wei === null) {
    return { name, status: "skip", detail: `${short(address)} — balance unreadable, RPC failed` };
  }
  if (wei === 0n) {
    return { name, status: "fail", detail: `${short(address)} holds no ETH — cannot transact` };
  }
  if (wei < minWei) {
    return {
      name,
      status: "fail",
      detail: `${short(address)} holds ${formatEth(wei)} ETH, under the ${formatEth(minWei)} floor`,
    };
  }
  return { name, status: "pass", detail: `${short(address)} holds ${formatEth(wei)} ETH` };
}

/// Is there a PUNO/USD rate the crediting path would actually accept?
///
/// `usableForCredit` rather than mere existence, because the two windows differ:
/// a rate can be fresh enough for the public pricing page and too old to value a
/// deposit, and that is precisely the state where billing has stopped while every
/// page still looks right.
export function checkRate(rate: TokenPrice | null, now: Date): CheckRow {
  const name = "PUNO/USD rate";
  if (rate === null) {
    return {
      name,
      status: "fail",
      detail: "no rate has ever been set — every deposit will fail to value. Run set-rate",
    };
  }
  const ageHours = (now.getTime() - rate.at.getTime()) / 3_600_000;
  const age = `${ageHours.toFixed(1)}h old`;
  if (!rate.usableForCredit) {
    return {
      name,
      status: "fail",
      detail: `$${rate.priceUsd} is ${age} — too stale to credit against. Run set-rate`,
    };
  }
  return { name, status: "pass", detail: `$${rate.priceUsd}, ${age}, source ${rate.source}` };
}

/// `SUM(creditLedger.amountUsd) == accounts.creditBalanceUsd`, for every account.
///
/// Drift is money unaccounted for: a charge or credit that moved the cached
/// balance without journalling it, or the reverse. Names the offending accounts,
/// because "the ledger does not balance" cannot be acted on.
export function checkLedger(
  result: { balanced: boolean; accountsChecked: number; drifted: { accountId: string }[] } | null,
): CheckRow {
  const name = "Credit ledger";
  if (result === null) return { name, status: "skip", detail: "database query failed" };
  if (result.accountsChecked === 0) {
    return { name, status: "pass", detail: "no accounts yet — nothing to reconcile" };
  }
  if (!result.balanced) {
    const ids = result.drifted.map((d) => d.accountId).join(", ");
    return {
      name,
      status: "fail",
      detail: `${result.drifted.length} of ${result.accountsChecked} account(s) drifted: ${ids}`,
    };
  }
  return { name, status: "pass", detail: `${result.accountsChecked} account(s) balanced` };
}

/// Does any address anywhere in this run belong to the 2026-08-13 incident?
///
/// Takes every address the run touched — config entries and values read back from
/// chain alike — because the compromised deployer can appear as an owner or a
/// treasury just as easily as in a config field.
export function checkBannedAddresses(
  addresses: readonly { label: string; address: string | null }[],
): CheckRow {
  const name = "Incident addresses";
  const hits = addresses.filter((entry) =>
    BANNED_ADDRESSES.some((banned) => sameAddress(entry.address, banned)),
  );
  if (hits.length > 0) {
    const where = hits.map((h) => `${h.label} = ${h.address}`).join("; ");
    return { name, status: "fail", detail: `STOP — compromised address present: ${where}` };
  }
  const counted = addresses.filter((entry) => entry.address !== null).length;
  return { name, status: "pass", detail: `${counted} address(es) checked, none compromised` };
}

export interface Summary {
  pass: number;
  fail: number;
  skip: number;
  na: number;
  /// True only when nothing failed and nothing was skipped. A skip is an
  /// unanswered question and this command exists to answer them, so it does not
  /// get to call a run green on the strength of the rows that happened to be
  /// readable. `na` rows do not block — they are answered, and the answer is
  /// "there is nothing there on this network yet".
  green: boolean;
}

export function summarize(rows: readonly CheckRow[]): Summary {
  const count = (status: CheckStatus) => rows.filter((r) => r.status === status).length;
  const fail = count("fail");
  const skip = count("skip");
  return { pass: count("pass"), fail, skip, na: count("na"), green: fail === 0 && skip === 0 };
}
