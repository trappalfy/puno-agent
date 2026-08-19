import { useState } from "react";
import { NETWORKS } from "@puno/shared";

/**
 * The PUNO contract address, on the hero.
 *
 * The address is read from `NETWORKS.mainnet.punoToken` rather than a constant
 * of its own: contract addresses live in packages/shared/src/network/config.ts
 * by project rule, and a second copy on the landing is a second thing to get
 * wrong on the one day nobody has time to check twice. Setting it there at T-0
 * lights this up with no further edit.
 *
 * **Renders nothing until the token exists.** A placeholder reading "coming
 * soon" on the one line people will screenshot is worse than an absence.
 *
 * **The full 42 characters, never truncated.** AddressChip in apps/web centre-
 * truncates because it sits in dense tables; here the address exists precisely
 * so a visitor can tell ours from an impersonator's, and impersonators match on
 * the first and last four. The middle is the only part that discriminates, so
 * hiding it defeats the whole point of printing it.
 *
 * Click-to-copy is not a convenience. The 2026-08-13 incident was a clipboard
 * hijacker substituting addresses, and hand-transcribing 42 characters is the
 * other way this goes wrong; one button that writes the exact string removes
 * both.
 */
export function ContractAddress() {
  const [copied, setCopied] = useState(false);
  const address = NETWORKS.mainnet.punoToken;
  const explorer = NETWORKS.mainnet.explorerUrl;

  if (!address) return null;

  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">PUNO contract</span>

      <div className="flex max-w-full items-center gap-2 rounded-[var(--radius-pills)] border border-white/15 bg-white/[0.04] px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          title={copied ? "Copied" : "Copy the full address"}
          className="font-jetbrains-mono text-[11px] md:text-xs break-all text-left text-white transition-colors hover:text-lime-phosphor"
        >
          {address}
        </button>

        <a
          href={`${explorer}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          aria-label="View the contract in the explorer"
          className="shrink-0 text-white/40 transition-colors hover:text-lime-phosphor"
        >
          ↗
        </a>
      </div>

      <span
        aria-live="polite"
        className={`text-[11px] transition-opacity ${copied ? "text-lime-phosphor opacity-100" : "opacity-0"}`}
      >
        Copied
      </span>
    </div>
  );
}
