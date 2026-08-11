# Puno contracts

`AgentVault` (one per user, deployed via `VaultFactory`'s CREATE2), plus the
`contracts/mocks/` used until real testnet DEX liquidity is confirmed. See
`docs/superpowers/specs` / the project plan for the full design — this file
only covers running things.

## Build & test

```shell
forge build
forge test              # 45 tests
forge test -vvv         # with traces
forge coverage --ir-minimum --report summary
```

`via_ir = true` is required for `AgentVault` (its `executeTrade` has enough
locals to hit "stack too deep" without it). `forge coverage`'s normal path
disables the optimizer/via-ir for accurate instrumentation and will fail to
compile as a result — always pass `--ir-minimum` for coverage here. Its branch
metric is known-unreliable under `--ir-minimum` (confirmed via `VaultFactory`
showing 0% branches despite 100% lines/functions and explicit tests for both
its `require`s) — use line/statement/function coverage instead.

## Deploy to testnet (46630)

```shell
DEPLOYER_PRIVATE_KEY=0x... forge script script/DeployTestnet.s.sol \
  --rpc-url https://rpc.testnet.chain.robinhood.com --broadcast
```

Deploys mock USDG/TSLA/AAPL + Chainlink-shaped mock price feeds + a mock
router with seeded liquidity + `VaultFactory` + one demo `AgentVault`, fully
policy-configured and lightly funded. Verified end-to-end against a local
Anvil chain before this was written up.

Real Uniswap v3 addresses are documented for Robinhood Chain **mainnet**
(4663) only — see
https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments
— nothing testnet-specific is published. Wiring up real DEX liquidity on
46630 instead of `MockRouter` is a follow-up once those addresses exist.

## Local dev loop

```shell
anvil                                    # separate terminal
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/DeployTestnet.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

That key is Anvil's well-known default account #0 — public, funded only on a
throwaway local chain, never use it anywhere real funds could reach it.
