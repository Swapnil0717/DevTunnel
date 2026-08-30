import Image from "next/image";
import Link from "next/link";

interface LogoProps {
  /** Renders as a link to "/" by default; pass false for static contexts. */
  asLink?: boolean;
  className?: string;
}

/**
 * DevTunnel logo — renders the actual provided logo image
 * (public/logo.png, the full "DevTunnel" wordmark + dot mark) rather than
 * a text wordmark. The `alt` text still carries the name as real,
 * screen-reader- and crawler-readable content, so the name stays
 * discoverable even though it's shown as an image.
 */
export function Logo({ asLink = true, className = "" }: LogoProps) {
  const content = (
    <Image
      src="/logo.png"
      alt="DevTunnel"
      width={1643}
      height={262}
      className={`h-6 w-auto ${className}`}
    />
  );

  if (!asLink) return content;

  return (
    <Link href="/" aria-label="DevTunnel home" className="inline-flex">
      {content}
    </Link>
  );
}