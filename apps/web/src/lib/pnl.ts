/// Unrealized P&L for a single position, in USD. Returns null when there's
/// no cost basis yet (position.ts's entryPriceUsd is only set on a real buy
/// fill — see apps/agent/src/loop/persist.ts). Uses plain JS numbers, same
/// as the rest of the display layer (chain/money.ts's usd1e18ToNumber) —
/// fine for a UI figure, never used to size or execute a trade.
export function computePositionPnlUsd(position: {
  rawBalance: string;
  decimals: number;
  valueUsd: string;
  entryPriceUsd: string | null;
}): number | null {
  if (position.entryPriceUsd === null) return null;
  const humanBalance = Number(position.rawBalance) / 10 ** position.decimals;
  const costBasisUsd = Number(position.entryPriceUsd) * humanBalance;
  return Number(position.valueUsd) - costBasisUsd;
}

export function sumPositionsPnlUsd(
  positions: {
    rawBalance: string;
    decimals: number;
    valueUsd: string;
    entryPriceUsd: string | null;
  }[],
): number {
  return positions.reduce((sum, p) => sum + (computePositionPnlUsd(p) ?? 0), 0);
}
