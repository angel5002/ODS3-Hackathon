import Link from "next/link";
import { APP_NAME } from "@/lib/labels";

/** Own mark: a calendar slot that comes back (no third-party logos). Flat: one outline, one check, small corners. */
export function BrandMark({ className = "size-8", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3" y="6" width="26" height="23" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h26" stroke="currentColor" strokeWidth="2" />
      <path d="M10.5 3v5M21.5 3v5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      <path
        d="M11 20l3.4 3.4 6.8-6.8"
        fill="none"
        stroke={tone === "light" ? "var(--color-mint)" : "var(--color-brand)"}
        strokeWidth="2.6"
        strokeLinecap="square"
      />
    </svg>
  );
}

/** Wordmark: a trailing "IA" goes in the brand colour, so it reads as "I" and not "l". */
export function Wordmark({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  const accent = APP_NAME.endsWith("IA");
  const head = accent ? APP_NAME.slice(0, -2) : APP_NAME;
  return (
    <span className={`font-bold tracking-[-0.01em] ${tone === "light" ? "text-white" : "text-ink"} ${className}`}>
      {head}
      {accent && <span className={tone === "light" ? "text-mint" : "text-brand"}>IA</span>}
    </span>
  );
}

export function Brand({ tone = "dark", href = "/", compact = false }: { tone?: "dark" | "light"; href?: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={`${APP_NAME}, inicio`}
      className={`flex min-h-11 items-center gap-2 ${tone === "light" ? "text-white" : "text-ink"}`}
    >
      <BrandMark className="size-7" tone={tone} />
      {!compact && <Wordmark tone={tone} className="text-[19px]" />}
    </Link>
  );
}
