import { and, eq } from "drizzle-orm";
import { privateKeyToAccount } from "viem/accounts";
import { schema } from "@puno/shared";
import { db } from "./client.js";
import { config } from "../config.js";
import { readVaultIdentity } from "../chain/vault.js";

/// Dev/local-verification seed — creates one account + vault + agent + limits
/// row pointing at an already-deployed AgentVault (see
/// contracts/script/DeployTestnet.s.sol). Reads owner/quoteToken/agent
/// straight from the chain rather than accepting them as separate env vars,
/// so the seeded row can never disagree with on-chain reality.
async function main() {
  const vaultAddress = config.vaultAddress;
  if (!vaultAddress) throw new Error("VAULT_ADDRESS is required in .env to seed");
  const agentPrivateKey = config.agentPrivateKey;
  if (!agentPrivateKey) {
    throw new Error(
      "AGENT_PRIVATE_KEY is required to seed (used only to derive the public agent address — never stored)",
    );
  }

  const agentAccount = privateKeyToAccount(agentPrivateKey as `0x${string}`);
  const identity = await readVaultIdentity(vaultAddress);

  console.log(
    `Vault ${vaultAddress}: owner=${identity.owner} quoteToken=${identity.quoteToken} agent=${identity.agent}`,
  );
  if (identity.agent.toLowerCase() !== agentAccount.address.toLowerCase()) {
    console.warn(
      `WARNING: vault.agent (${identity.agent}) does not match AGENT_PRIVATE_KEY's derived address ` +
        `(${agentAccount.address}). The worker will report guard failures on every tick until the ` +
        `vault owner calls setAgent(${agentAccount.address}, <expiry>).`,
    );
  }

  // Seeded with a working balance rather than the production starter grant —
  // a dev account that runs dry after six decisions makes the local loop
  // useless for exactly the debugging it exists for.
  const [account] = await db
    .insert(schema.accounts)
    .values({ email: "dev@puno.local", creditBalanceUsd: "100.000000" })
    .returning();

  await db.insert(schema.creditLedger).values({
    accountId: account!.id,
    kind: "adjustment",
    amountUsd: "100.000000",
    refType: "manual",
  });

  await db
    .insert(schema.vaults)
    .values({
      address: vaultAddress,
      ownerAddress: identity.owner,
      quoteToken: identity.quoteToken,
      network: config.network.key,
    })
    .onConflictDoNothing({ target: [schema.vaults.address, schema.vaults.network] });

  const [vault] = await db
    .select()
    .from(schema.vaults)
    .where(
      and(eq(schema.vaults.address, vaultAddress), eq(schema.vaults.network, config.network.key)),
    )
    .limit(1);
  if (!vault) throw new Error("failed to create or find vault row");

  const [agentRow] = await db
    .insert(schema.agents)
    .values({
      accountId: account!.id,
      vaultId: vault.id,
      name: "Dev Agent",
      agentAddress: agentAccount.address,
      dryRun: config.dryRun,
      status: "armed",
    })
    .returning();

  await db.insert(schema.limits).values({
    agentId: agentRow!.id,
    stopLossBps: 1000,
    takeProfitBps: 2000,
    maxReviewIntervalHours: 6,
    priceMoveTriggerBps: 300,
    maxCallsPerHour: 12,
  });

  console.log(`Seeded agent ${agentRow!.id} ("${agentRow!.name}") for vault ${vault.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
