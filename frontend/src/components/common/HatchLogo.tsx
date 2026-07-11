export default function HatchLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-medium tracking-tight ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 20V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 20V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 13H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 20L8 16C8 14.3 9.3 13 11 13H13C14.7 13 16 14.3 16 16V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-semibold">HATCH</span>
    </span>
  );
}
