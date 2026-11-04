import Link from "next/link";
import { APP_NAME } from "@/lib/labels";

/** Own mark: a calendar slot that comes back (no third-party logos). Same as video/insumos/logo-asistia.svg. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="2" y="5" width="28" height="25" rx="7" fill="currentColor" opacity="0.14" />
      <rect x="2" y="5" width="28" height="25" rx="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 2.5v5M22 2.5v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10.5 18.5l3.6 3.6 7.6-7.6" fill="none" stroke="var(--color-mint)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Wordmark: a trailing "IA" goes in the accent color, so it reads as "I" and not "l". */
export function Wordmark({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  const accent = APP_NAME.endsWith("IA");
  const head = accent ? APP_NAME.slice(0, -2) : APP_NAME;
  return (
    <span className={`font-display font-extrabold tracking-[-0.02em] ${tone === "light" ? "text-white" : "text-ink"} ${className}`}>
      {head}
      {accent && <span className={tone === "light" ? "text-mint" : "text-brand"}>IA</span>}
    </span>
  );
}

export function Brand({ tone = "dark", href = "/" }: { tone?: "dark" | "light"; href?: string }) {
  return (
    <Link href={href} aria-label={`${APP_NAME}, inicio`} className={`group flex items-center gap-2.5 ${tone === "light" ? "text-white" : "text-brand"}`}>
      <BrandMark className="size-8 transition-transform duration-300 ease-out group-hover:-rotate-6" />
      <Wordmark tone={tone} className="text-[19px]" />
    </Link>
  );
}
