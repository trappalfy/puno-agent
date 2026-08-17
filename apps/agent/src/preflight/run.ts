import {
  punoCreditsAbi,
  vaultFactoryAbi,
  erc20Abi,
  reconcileAll,
  tryGetPunoUsdPrice,
} from "@puno/shared";
import type { Address } from "viem";
import { db } from "../db/client.js";
import { publicClient } from "../chain/client.js";
import { config } from "../config.js";
import {
  checkBannedAddresses,
  checkBytecode,
  checkCreditsToken,
  checkGas,
  checkLedger,
  checkOwnership,
  checkQuoteToken,
  checkRate,
  checkTokenDecimals,
  checkTreasury,
  summarize,
  type CheckRow,
} from "./checks.js";

/// `pnpm --filter @puno/agent preflight`
///
/// One command, one table, every row read from the chain or the database rather
/// than from a deploy log. A deploy log says what was requested; a call says what
/// is true, and the gap between those two is where the expensive mistakes live.
///
/// Written for the day the PUNO address arrives, when the sequence is: verify the
/// token, deploy billing, accept ownership from the cold wallet, one commit to
/// `config.ts`, then this. Its job is to replace "I think that all lined up" with
/// a green line or a named row.
///
/// Two expectations cannot be derived from the chain and come from the
/// environment, both public addresses and never keys:
///
///   PUNO_OWNER        the cold wallet that must own PunoCredits
///   DEPLOYER_ADDRESS  the deploying key's address, so treasury can be proven
///                     not to equal it
///
/// Reads are **sequential and individually guarded**, which is deliberate twice
/// over: the public mainnet RPC sits behind Cloudflare and answers a batched
/// JSON-RPC POST with an HTML interstitial, and there is no Multicall3 on testnet.
/// A guarded read returns null, which surfaces as `skip` — an unanswered question
/// that blocks a green verdict rather than a crash that loses the other rows.

async function read<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function hasCode(address: Address | null): Promise<boolean | null> {
  if (!address) return null;
  const code = await read(() => publicClient.getCode({ address }));
  if (code === null) return null;
  return code !== undefined && code !== "0x";
}

function envAddress(name: string): Address | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    console.error(`preflight: ${name}="${raw}" is not a 20-byte address — ignoring it.`);
    return null;
  }
  return raw as Address;
}

/// Host and database name from a connection string, with the credentials left
/// behind. Falls back to a marker rather than throwing: this is a banner line,
/// and an unparseable URL should not be the reason a readiness check dies.
function databaseHost(url: string): string {
  try {
    const parsed = new URL(url);
    const pooled = parsed.hostname.includes("-pooler") ? " (pooled)" : "";
    return `${parsed.hostname}${parsed.pathname}${pooled}`;
  } catch {
    return "unparseable DATABASE_URL";
  }
}

const STATUS_LABEL = {
  pass: "PASS",
  fail: "FAIL",
  skip: "SKIP",
  na: " n/a",
} as const;

function render(rows: readonly CheckRow[]): void {
  const width = Math.max(...rows.map((r) => r.name.length));
  for (const row of rows) {
    console.log(`  ${STATUS_LABEL[row.status]}  ${row.name.padEnd(width)}  ${row.detail}`);
  }
}

async function main(): Promise<void> {
  const net = config.network;
  const now = new Date();

  console.log(`preflight — ${net.name} (chain ${net.chainId})`);
  console.log(`RPC ${config.rpcUrl}`);
  // The host only — the rest of a connection string is a password. Printed
  // because half these rows describe a database rather than a chain, and a run
  // against the wrong one looks exactly like a run against the right one. That
  // is the mistake `set-rate` avoids by printing the previous rate, and this
  // command is the one that gets pointed at localhost by a stale shell.
  console.log(`DB  ${databaseHost(config.databaseUrl)}`);
  console.log("");

  const expectedOwner = envAddress("PUNO_OWNER");
  const deployer = envAddress("DEPLOYER_ADDRESS");

  const credits = net.punoCredits;
  const token = net.punoToken;
  const factory = net.vaultFactory;

  // Chain reads, one at a time. Ordered so the cheap existence checks come
  // before the calls that only make sense if something is there.
  const codeChecks: CheckRow[] = [];
  for (const [name, address] of [
    ["VaultFactory bytecode", factory],
    ["PunoCredits bytecode", credits],
    ["PUNO token bytecode", token],
    ["USDG bytecode", net.tokens.usdg],
    ["Demo vault bytecode", net.demoVault?.address ?? null],
  ] as const) {
    codeChecks.push(checkBytecode(name, address, await hasCode(address)));
  }

  const onChainToken = credits
    ? await read(() =>
        publicClient.readContract({ address: credits, abi: punoCreditsAbi, functionName: "token" }),
      )
    : null;
  const treasury = credits
    ? await read(() =>
        publicClient.readContract({
          address: credits,
          abi: punoCreditsAbi,
          functionName: "treasury",
        }),
      )
    : null;
  const owner = credits
    ? await read(() =>
        publicClient.readContract({ address: credits, abi: punoCreditsAbi, functionName: "owner" }),
      )
    : null;
  const pendingOwner = credits
    ? await read(() =>
        publicClient.readContract({
          address: credits,
          abi: punoCreditsAbi,
          functionName: "pendingOwner",
        }),
      )
    : null;
  const tokenDecimals = token
    ? await read(() =>
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      )
    : null;
  const quoteToken = factory
    ? await read(() =>
        publicClient.readContract({
          address: factory,
          abi: vaultFactoryAbi,
          functionName: "quoteToken",
        }),
      )
    : null;

  const serviceAgentWei = net.serviceAgent
    ? await read(() => publicClient.getBalance({ address: net.serviceAgent as Address }))
    : null;
  const deployerWei = deployer
    ? await read(() => publicClient.getBalance({ address: deployer }))
    : null;

  // Database reads. Both are guarded the same way — a database that cannot be
  // reached is an unanswered question, not a reason to lose the chain rows.
  const rate = await read(() => tryGetPunoUsdPrice(db, now));
  const ledger = await read(() => reconcileAll(db));

  // Every address this run touched, config and chain alike, for the incident
  // check. The compromised deployer could just as easily surface as an owner or a
  // treasury as in a config field, so the list is built from what was read and
  // not from what was configured.
  const touched: { label: string; address: string | null }[] = [
    { label: "config.vaultFactory", address: factory },
    { label: "config.punoCredits", address: credits },
    { label: "config.punoToken", address: token },
    { label: "config.usdg", address: net.tokens.usdg },
    { label: "config.serviceAgent", address: net.serviceAgent },
    { label: "config.demoVault", address: net.demoVault?.address ?? null },
    { label: "chain PunoCredits.token", address: onChainToken },
    { label: "chain PunoCredits.treasury", address: treasury },
    { label: "chain PunoCredits.owner", address: owner },
    { label: "chain PunoCredits.pendingOwner", address: pendingOwner },
    { label: "chain VaultFactory.quoteToken", address: quoteToken },
    { label: "env PUNO_OWNER", address: expectedOwner },
    { label: "env DEPLOYER_ADDRESS", address: deployer },
  ];

  const rows: CheckRow[] = [
    ...codeChecks,
    checkCreditsToken({ credits, configuredToken: token, onChainToken }),
    checkTokenDecimals({ token, configured: net.punoDecimals, onChain: tokenDecimals }),
    checkOwnership({ credits, owner, pendingOwner, expectedOwner, isTestnet: net.isTestnet }),
    checkTreasury({ credits, treasury, deployer, owner }),
    checkQuoteToken({ factory, configuredUsdg: net.tokens.usdg, onChain: quoteToken }),
    checkGas("Gas — serviceAgent", net.serviceAgent, serviceAgentWei),
    checkGas("Gas — deployer", deployer, deployerWei),
    checkRate(rate, now),
    checkLedger(ledger),
    checkBannedAddresses(touched),
  ];

  render(rows);

  const s = summarize(rows);
  console.log("");
  console.log(`${s.pass} pass · ${s.fail} fail · ${s.skip} skip · ${s.na} n/a`);

  if (s.na > 0) {
    // Printed even on a green run, and separately from the verdict. "Green" with
    // half the table absent is a sentence the reader has to see whole — on
    // mainnet today most of billing is n/a because PUNO does not exist yet, and
    // that is a true statement about readiness, not a passing grade.
    const names = rows.filter((r) => r.status === "na").map((r) => r.name);
    console.log(`n/a on this network: ${names.join(", ")}`);
  }

  if (s.fail > 0) {
    console.log("");
    console.log("NOT READY — fix the FAIL rows above.");
    process.exit(1);
  }
  if (s.skip > 0) {
    console.log("");
    console.log("INCONCLUSIVE — something could not be checked. A skip is not a pass.");
    process.exit(1);
  }
  console.log("");
  console.log(`READY — everything checkable on ${net.name} is correct.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Never the error object: a postgres connection failure carries the DSN,
    // password included. Same rule as set-rate.
    console.error("preflight failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
