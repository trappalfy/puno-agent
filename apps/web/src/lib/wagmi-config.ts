import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodMainnet, robinhoodTestnet } from "@puno/shared";

// WalletConnect/Coinbase connectors need a project ID / API key we don't
// have yet — injected (MetaMask, Rabby, browser wallets) covers the dev
// flow without one. Add the others once those credentials exist.
export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, robinhoodMainnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
    [robinhoodMainnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
