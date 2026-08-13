import { formatUnits } from "viem";

/// A 1e18-scaled on-chain USD value (NAV, notional, price) as a decimal
/// string suitable for a Postgres `numeric` column — Postgres rounds to the
/// column's declared scale on insert, so no manual truncation is needed here.
export function usd1e18ToDecimalString(value: bigint): string {
  return formatUnits(value, 18);
}

export function usd1e18ToNumber(value: bigint): number {
  return Number(usd1e18ToDecimalString(value));
}

export function rawAmountToDecimalString(raw: bigint): string {
  return raw.toString();
}
