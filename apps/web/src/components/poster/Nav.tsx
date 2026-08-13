import Link from "next/link";
import { ConnectWalletButton } from "../ConnectWalletButton";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#safety", label: "Safety" },
  { href: "/pricing", label: "Pricing" },
];

/**
 * landing.md — Layout: "a slim top bar with logo left, nav center, login +
 * lime CTA right", and Pill Navigation Link: "9999px radius, small padding
 * (~10px horizontal), Denim Ink weight 400, #ffffff text on transparent
 * background. No border on default nav items; the Login button uses the same
 * pill shape but with a white 1px border."
 *
 * "Login" here is a connected wallet — see ConnectWalletButton.
 */
export function Nav() {
  return (
    <nav className="mx-auto flex max-w-(--layout-max-width) items-center justify-between gap-[var(--spacing-24)] px-[var(--spacing-24)] py-[var(--spacing-24)]">
      <Link href="/" className="text-subheading font-denim-ink font-semibold text-white">
        Puno
      </Link>

      <div className="hidden items-center gap-[var(--spacing-8)] md:flex">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-[var(--radius-pills)] px-[10px] py-[var(--spacing-8)] text-body-sm font-denim-ink text-white transition-colors duration-[var(--motion-hover)] hover:text-lime-phosphor"
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-[var(--spacing-16)]">
        <Link
          href="/app"
          className="hidden rounded-[var(--radius-pills)] border border-white px-[var(--spacing-16)] py-[var(--spacing-8)] text-body-sm font-denim-ink text-white transition-colors duration-[var(--motion-hover)] hover:border-lime-phosphor hover:text-lime-phosphor sm:inline-flex"
        >
          Dashboard
        </Link>
        {/* Pill shape to match the Dashboard link beside it. At poster density
            the default button geometry is 32x18px padding on a 16px radius —
            twice the padding of the nav's own 16x8px pills, and a rounded
            rectangle sitting next to a fully round one. */}
        <ConnectWalletButton shape="pill" />
      </div>
    </nav>
  );
}
