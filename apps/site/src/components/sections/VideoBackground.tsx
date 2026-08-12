import { useEffect, useRef } from "react";

const VIDEO_URL = "/lime_spiral_recolored.mp4";

/**
 * Fixed fullscreen background video — our own recolored asset (served from
 * apps/site/public/), replacing the source prompt's blue third-party
 * CloudFront clip. bg-forest-canopy on the wrapper is still the fallback in
 * case the file ever fails to load, so the page reads as our brand's dark
 * canvas rather than going blank or white.
 *
 * The scrim on top is the lesson from the earlier Payy-style hero attempt in
 * this project's history: white text laid directly over a bright, moving
 * background measured well under the 4.5:1 floor there, and it took an
 * explicit darkening layer to fix. Heavier top/bottom (nav and footer-area
 * text sit there) than the middle (where the video should actually read as
 * video) — verified against a real captured frame, not assumed.
 *
 * Also renders the two vertical guide lines from the same prompt section —
 * a fixed pair of hairlines at the content column's edges, visible through
 * the video the way a technical drawing's margin guides would be.
 */
export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) videoRef.current?.pause();
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-0 bg-forest-canopy pointer-events-none">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover pointer-events-none"
          src={VIDEO_URL}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in oklab, var(--color-forest-canopy) 62%, transparent) 0%, color-mix(in oklab, var(--color-forest-canopy) 30%, transparent) 22%, color-mix(in oklab, var(--color-forest-canopy) 38%, transparent) 60%, color-mix(in oklab, var(--color-forest-canopy) 70%, transparent) 100%)",
          }}
        />
      </div>
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 -translate-x-[calc(50%+36rem)] w-px bg-white/10 z-[5]" />
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 translate-x-[calc(-50%+36rem)] w-px bg-white/10 z-[5]" />
    </>
  );
}
