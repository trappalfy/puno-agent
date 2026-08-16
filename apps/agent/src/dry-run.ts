/// Whether this worker is allowed to broadcast a trade.
///
/// Its own module, and a pure function, because `config.ts` cannot be imported
/// without a `DATABASE_URL` and this is the one setting that must be tested
/// exhaustively: it is the difference between a simulation and someone's money.
///
/// The rule is **fail safe, then fail loud**. An absent value means dry run,
/// because the setting nobody thought about must not be the one that spends
/// funds. An unrecognised value is refused outright rather than resolved: the
/// previous implementation answered `DRY_RUN=yes` with live trading, which is
/// the exact case its own comment promised could never happen.
export function parseDryRun(raw: string | undefined): boolean {
  // Empty counts as absent — `.env` files ship keys with no value, and an
  // operator who has cleared a variable has not asked to go live.
  if (raw === undefined || raw.trim() === "") return true;

  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;

  throw new Error(
    `DRY_RUN="${raw}" is not a value I will guess at. Use true/1 to simulate, ` +
      `false/0 to broadcast real trades, or leave it unset to simulate. ` +
      `Refusing to start rather than pick one for you.`,
  );
}
