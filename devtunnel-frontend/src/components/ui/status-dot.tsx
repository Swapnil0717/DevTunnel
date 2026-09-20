interface StatusDotProps {
  color: string;
  className?: string;
}

/** Decorative colored dot. Always paired with real text — never the only
 * way to convey status (Frontend_Development_Rules.txt rule 43). */
export function StatusDot({ color, className = "" }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[6px] w-[6px] rounded-full ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}
