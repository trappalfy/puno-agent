import Link from "next/link";
import { Divider } from "../ui/Divider";

export function Footer() {
  return (
    <footer className="mx-auto max-w-(--layout-max-width) px-[var(--spacing-24)] py-[var(--spacing-80)]">
      <Divider className="mb-[var(--spacing-40)]" />
      <div className="flex flex-col gap-[var(--spacing-24)] md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-subheading font-denim-ink font-semibold text-white">Puno</div>
          <p className="mt-[var(--spacing-16)] max-w-sm text-body-sm text-white">
            Non-custodial vaults. An agent that can propose trades within limits you set — never
            withdraw. Testnet only until a separate, explicit mainnet launch.
          </p>
        </div>
        <div className="flex gap-[var(--spacing-40)] text-body-sm text-white">
          <div className="flex flex-col gap-[var(--spacing-16)]">
            <span className="font-semibold">Product</span>
            <Link href="/app" className="hover:text-lime-phosphor">
              Dashboard
            </Link>
            <Link href="/pricing" className="hover:text-lime-phosphor">
              Pricing
            </Link>
          </div>
          <div className="flex max-w-xs flex-col gap-[var(--spacing-16)]">
            <span className="font-semibold">Legal</span>
            <span>Not available to US persons, Canada, UK, or Switzerland</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
