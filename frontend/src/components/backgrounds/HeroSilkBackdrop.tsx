import { lazy, Suspense } from "react";

const Silk = lazy(() => import("@/components/backgrounds/Silk"));

/**
 * Full-bleed Silk backdrop for marketing heroes.
 * Soft vignette + bottom fade keep typography readable over the fabric.
 */
export function HeroSilkBackdrop({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <Suspense
        fallback={
          <div className="absolute inset-0" style={{ backgroundColor: "#120F17" }} />
        }
      >
        <Silk
          speed={5}
          scale={1}
          color="#7B7481"
          noiseIntensity={1.5}
          rotation={0}
          className="absolute inset-0 h-full w-full"
        />
      </Suspense>

      {/* Soft lift for left-aligned copy */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 18% 32%, rgba(18,15,23,0.55) 0%, transparent 62%)",
        }}
      />
      {/* Top edge blend into nav */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#120F17]/90 to-transparent" />
      {/* Bottom fade into next section */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/70 to-transparent" />
      {/* Subtle side vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.35) 0%, transparent 28%, transparent 72%, rgba(0,0,0,0.25) 100%)",
        }}
      />
    </div>
  );
}
