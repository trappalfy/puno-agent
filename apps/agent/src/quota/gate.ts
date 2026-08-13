export interface BudgetCheck {
  allowed: boolean;
  reason: string | null;
}

/// Plan 3.4 safeguard #2 — "проверка до вызова": the balance must cover the
/// charge BEFORE the call, not after. Pure and dependency-free by design (no
/// db/config imports) so it's trivially unit-testable — see service.ts for the
/// DB-backed wrapper that actually gates tick.ts.
///
/// Under pay-per-action the price is known exactly up front, so unlike the old
/// budget gate this is not an estimate: if it says yes, the charge will succeed.
export function evaluateBalance(balanceUsd: number, priceUsd: number): BudgetCheck {
  if (balanceUsd < priceUsd) {
    return {
      allowed: false,
      reason: `insufficient credit: $${balanceUsd.toFixed(4)} available, $${priceUsd.toFixed(4)} required`,
    };
  }
  return { allowed: true, reason: null };
}

/// Plan 3.4 safeguard #3 — an hourly rate limit independent of the remaining
/// balance. Originally there to stop a broken trigger burning a month's quota
/// in an hour; now it also caps what a broken trigger can bill the *user*,
/// which is why the default came down from 12 to 6.
export function evaluateRateLimit(callsInLastHour: number, maxCallsPerHour: number): BudgetCheck {
  if (callsInLastHour >= maxCallsPerHour) {
    return {
      allowed: false,
      reason: `hourly rate limit reached: ${callsInLastHour}/${maxCallsPerHour} calls in the last hour`,
    };
  }
  return { allowed: true, reason: null };
}
