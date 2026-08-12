import { LogoMark } from "../primitives/LogoMark";
import { links } from "../../lib/config";

export function Footer() {
  return (
    <footer className="relative z-10 max-w-6xl mx-auto px-6 py-16 border-t border-white/10">
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-white">
            <LogoMark className="w-6 h-6" />
            <span className="font-semibold">Puno</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-white/50 leading-[1.5]">
            Non-custodial vaults. An agent that can propose trades within limits you set — never
            withdraw. Testnet only until a separate, explicit mainnet launch.
          </p>
        </div>
        <div className="flex gap-12 text-sm text-white/60">
          <div className="flex flex-col gap-2.5">
            <span className="text-white font-medium">Product</span>
            <a href={links.dashboard} className="hover:text-white transition-colors">
              Dashboard
            </a>
            <a href={links.pricing} className="hover:text-white transition-colors">
              Pricing
            </a>
          </div>
          <div className="flex flex-col gap-2.5 max-w-xs">
            <span className="text-white font-medium">Legal</span>
            <span>Not available to US persons, Canada, UK, or Switzerland</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
