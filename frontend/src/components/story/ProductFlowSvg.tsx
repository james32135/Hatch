import { motion } from "framer-motion";

/** Animated SVG product story: Parent → Allowance → SoDEX → Portfolio → Lesson → ValueChain */
export function ProductFlowSvg({ className = "" }: { className?: string }) {
  const nodes = [
    { x: 60, label: "Parent", sub: "Approves" },
    { x: 200, label: "Allowance", sub: "Weekly plan" },
    { x: 340, label: "SoDEX", sub: "Real trade" },
    { x: 480, label: "Portfolio", sub: "Updates" },
    { x: 620, label: "Lesson", sub: "AI explains" },
    { x: 760, label: "ValueChain", sub: "Recorded" },
  ];

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-sky-500/[0.06] to-transparent p-3 md:p-4 ${className}`}>
      <svg viewBox="0 0 820 160" className="h-36 w-full md:h-40" role="img" aria-label="How HATCH builds a child's future">
        <defs>
          <linearGradient id="storyLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#a7f3d0" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base path */}
        <path
          d="M 60 55 H 760"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        {/* Animated draw */}
        <motion.path
          d="M 60 55 H 760"
          stroke="url(#storyLine)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
          filter="url(#softGlow)"
        />

        {/* Traveling pulse */}
        <circle r="5" fill="#7dd3fc" filter="url(#softGlow)">
          <animateMotion dur="4s" repeatCount="indefinite" path="M 60 55 H 760" />
        </circle>

        {nodes.map((n, i) => (
          <g key={n.label}>
            <motion.circle
              cx={n.x}
              cy={55}
              r={14}
              fill="#0a0a0c"
              stroke={i % 2 === 0 ? "#38bdf8" : "#34d399"}
              strokeWidth={2}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 160, damping: 14 }}
              style={{ transformOrigin: `${n.x}px 55px` }}
            />
            <text x={n.x} y={95} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="12" fontWeight="500">
              {n.label}
            </text>
            <text x={n.x} y={112} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">
              {n.sub}
            </text>
          </g>
        ))}
      </svg>
      <p className="px-2 pb-1 text-center text-xs text-white/45">
        Instead of weekly spending money, build their future automatically.
      </p>
    </div>
  );
}
