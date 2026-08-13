import { MotionConfig } from "motion/react";
import { NoiseFilters } from "./components/primitives/NoiseFilters";
import { VideoBackground } from "./components/sections/VideoBackground";
import { Navbar } from "./components/sections/Navbar";
import { Hero } from "./components/sections/Hero";
import { TerminalBar } from "./components/sections/TerminalBar";
import { ConsoleMock } from "./components/sections/ConsoleMock";
import { CostRouting } from "./components/sections/CostRouting";
import { BuiltOn } from "./components/sections/BuiltOn";
import { Guarantees } from "./components/sections/Guarantees";
import { PricingSection } from "./components/sections/PricingSection";
import { FinalCta } from "./components/sections/FinalCta";
import { Footer } from "./components/sections/Footer";

export function App() {
  return (
    // "user" makes every motion.* component below defer to the OS
    // prefers-reduced-motion setting automatically (fades still play,
    // transform/slide animations collapse to instant) — one place, rather
    // than threading a matchMedia check through each of the ~10 sections
    // that use entrance motion.
    <MotionConfig reducedMotion="user">
      <div id="top" data-density="poster" className="relative min-h-screen overflow-x-hidden bg-forest-canopy text-white">
        <NoiseFilters />
        <VideoBackground />

        {/* Navbar and hero share one viewport-tall column so the hero fills
            whatever is left under the bar without anyone hardcoding the bar's
            height. svh rather than vh: on mobile, vh counts the browser chrome
            that later retracts, which would push the next section partly into
            view on load — the one thing this layout is meant to prevent. */}
        <div className="relative z-10 flex min-h-svh flex-col">
          <Navbar />
          <Hero />
        </div>

        <TerminalBar />
        <ConsoleMock />
        <CostRouting />
        <BuiltOn />
        <Guarantees />
        <PricingSection />
        <FinalCta />
        <Footer />
      </div>
    </MotionConfig>
  );
}
