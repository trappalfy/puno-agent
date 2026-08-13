"use client";

import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi-config";
import { GeoGateModal } from "@/components/GeoGateModal";
import { ConsentRecorder } from "@/components/ConsentRecorder";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <GeoGateModal />
        <ConsentRecorder />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
