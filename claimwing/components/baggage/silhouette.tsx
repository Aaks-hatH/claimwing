/** Framing guides drawn over the camera view. Purely visual. */
export function Silhouette({ angle, className }: { angle: string; className?: string }) {
  const stroke = { fill: "none", stroke: "white", strokeWidth: 1.5, strokeDasharray: "6 5", vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className={className} aria-hidden>
      {(angle === "front" || angle === "back") && (
        <>
          <rect x="28" y="18" width="44" height="66" rx="5" {...stroke} />
          <path d="M44 18v-6h12v6" {...stroke} />
          <circle cx="33" cy="87" r="2.5" {...stroke} />
          <circle cx="67" cy="87" r="2.5" {...stroke} />
        </>
      )}
      {(angle === "left" || angle === "right") && (
        <>
          <rect x="38" y="18" width="24" height="66" rx="4" {...stroke} />
          <path d="M45 40h10" {...stroke} />
          <circle cx="42" cy="87" r="2.5" {...stroke} />
          <circle cx="58" cy="87" r="2.5" {...stroke} />
        </>
      )}
      {angle === "top" && (
        <>
          <rect x="22" y="36" width="56" height="28" rx="5" {...stroke} />
          <path d="M40 50h20" {...stroke} />
          <rect x="44" y="40" width="12" height="4" rx="1" {...stroke} />
        </>
      )}
      {angle === "bottom" && (
        <>
          <rect x="22" y="36" width="56" height="28" rx="5" {...stroke} />
          <circle cx="28" cy="40" r="3" {...stroke} />
          <circle cx="72" cy="40" r="3" {...stroke} />
          <circle cx="28" cy="60" r="3" {...stroke} />
          <circle cx="72" cy="60" r="3" {...stroke} />
        </>
      )}
      {angle === "tag" && (
        <>
          <rect x="18" y="38" width="64" height="24" rx="3" {...stroke} />
          <path d="M24 44v12M28 44v12M31 44v12M35 44v12M40 44v12M43 44v12M48 44v12" {...stroke} strokeDasharray="none" opacity={0.6} />
        </>
      )}
      {angle === "scale" && (
        <>
          <rect x="30" y="34" width="40" height="22" rx="3" {...stroke} />
          <text x="50" y="49" textAnchor="middle" fontSize="8" fill="white" opacity={0.8}>
            23.0 kg
          </text>
        </>
      )}
    </svg>
  );
}
