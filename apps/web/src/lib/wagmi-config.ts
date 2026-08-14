import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodMainnet, robinhoodTestnet } from "@puno/shared";

// WalletConnect/Coinbase connectors need a project ID / API key we don't
// have yet — injected (MetaMask, Rabby, browser wallets) covers the dev
// flow without one. Add the others once those credentials exist.
export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, robinhoodMainnet],
  connectors: [injected()],
  // Required because every page here is server-rendered first.
  //
  // Without it wagmi restores a previously connected wallet from localStorage
  // *synchronously*, during the very first client render. The server had no
  // such storage, so it rendered the signed-out tree — and React found "Sign
  // in" where the server had put "Connect Wallet" and threw a hydration error.
  //
  // It only appears once a wallet has connected at least once, which is why it
  // stayed hidden until the connect button started working: with nothing
  // persisted, both sides agreed on "disconnected" by accident.
  //
  // `ssr: true` defers that restore into an effect, so the first client render
  // matches the server's and the reconnect lands on the next one. Fixing it
  // here rather than per-component covers every `useAccount` caller at once —
  // the dashboard, the trial page and the sidebar all had the same exposure.
  ssr: true,
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
