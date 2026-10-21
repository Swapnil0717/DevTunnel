import type { CSSProperties } from "react";

/**
 * Inline icon from the page's SVG sprite (`IconSprite`). The ids are prefixed
 * `dti-` so they can never clash with another sprite on the page.
 */
export function Ic({
  id,
  size,
  className = "",
  style,
}: {
  id: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const sized = size ? { width: size, height: size, ...style } : style;
  return (
    <svg className={`ic ${className}`.trim()} style={sized} aria-hidden="true">
      <use href={`#dti-${id}`} />
    </svg>
  );
}
