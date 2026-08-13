import type { ReactNode } from "react";
import { Sidebar } from "@/components/terminal/Sidebar";
import { NetworkGuard } from "@/components/terminal/NetworkGuard";

export default function TerminalLayout({ children }: { children: ReactNode }) {
  return (
    <div data-density="terminal" className="flex min-h-screen min-w-(--layout-min-width)">
      <Sidebar />
      <main className="flex-1 p-[var(--layout-card-padding)]">
        <NetworkGuard>{children}</NetworkGuard>
      </main>
    </div>
  );
}
