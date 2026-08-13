"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/Button";

const CONSENT_KEY = "puno_geo_consent_v1";
const RESTRICTED = ["United States persons", "Canada", "United Kingdom", "Switzerland"];

/// DESIGN.md #25 — blocking onboarding step, shown before any wallet
/// interaction is reachable (it's a fixed full-screen overlay in the root
/// layout, so there is no path around it). Consent is durably recorded
/// server-side too — see recordGeoConsent — once a wallet connects.
export function GeoGateModal() {
  const [accepted, setAccepted] = useState(true); // default true avoids an SSR/CSR flash
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setAccepted(localStorage.getItem(CONSENT_KEY) === "1");
  }, []);

  if (accepted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-forest-canopy/95 px-[var(--spacing-24)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="geo-gate-title"
    >
      <div className="max-w-lg rounded-[var(--radius-cards)] bg-vault-floor p-[var(--layout-card-padding)]">
        <h2
          id="geo-gate-title"
          className="text-app-heading font-denim-ink font-semibold text-white"
        >
          Before you continue
        </h2>
        <p className="mt-[var(--spacing-16)] text-app-body text-white-muted">
          Puno trades tokenized US stock tokens. Per Robinhood's terms, these tokens are not offered
          to:
        </p>
        <ul className="mt-[var(--spacing-12)] flex flex-col gap-[var(--spacing-8)]">
          {RESTRICTED.map((j) => (
            <li
              key={j}
              className="flex items-center gap-[var(--spacing-8)] text-app-body text-white"
            >
              <span className="text-signal-amber" aria-hidden>
                ●
              </span>
              {j}
            </li>
          ))}
        </ul>
        <p className="mt-[var(--spacing-16)] text-app-body-sm text-white-muted">
          Puno is presently testnet-only — no real funds are at risk — but this restriction still
          applies to who may use the product.
        </p>
        <label className="mt-[var(--spacing-24)] flex items-start gap-[var(--spacing-12)] text-app-body-sm text-white">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4 accent-lime-phosphor"
          />
          I confirm I am not a resident of, or located in, any jurisdiction listed above.
        </label>
        <div className="mt-[var(--spacing-24)]">
          <Button
            variant="primary"
            disabled={!checked}
            onClick={() => {
              localStorage.setItem(CONSENT_KEY, "1");
              setAccepted(true);
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
