import { Activity, AlertTriangle, BookOpen, Moon, Search, SearchX, Star, Sun, Ticket } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useTheme } from "../lib/theme";

/* ---------- Logo: an "L" that is also a door key / room card, with a coral sun ---------- */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-display text-[1.35rem] font-semibold tracking-tight text-ink">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="none">
        <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeWidth="1.5" className="text-accent-text" />
        <path d="M10 8v16h13v-3.6h-9.2V8z" fill="currentColor" className="text-accent-text" />
        <circle cx="22.5" cy="11" r="2.6" fill="var(--coral)" />
      </svg>
      Lodgic
    </span>
  );
}

/* ---------- Theme ---------- */
export { useTheme } from "../lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={toggle} className="btn btn-ghost btn-icon" aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} aria-pressed={theme === "dark"}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/* ---------- Layout ---------- */
const nav = [
  { to: "/search", label: "Search", Icon: Search },
  { to: "/bookings", label: "My bookings", Icon: Ticket },
  { to: "/how-it-works", label: "How it works", Icon: BookOpen },
  { to: "/admin", label: "Ops", Icon: Activity },
];

export function Layout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/80 border-b border-line">
        <div className="container-x h-16 flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0 rounded-md" aria-label="Lodgic home">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className="nav-link">
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="https://github.com/D-L-Narayana/lodgic" className="btn btn-ghost btn-sm hidden sm:inline-flex" rel="noopener noreferrer" target="_blank">
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1 pb-16 md:pb-0" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-line grid grid-cols-4 pb-[env(safe-area-inset-bottom)]" aria-label="Mobile">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} className="tab-link">
            <n.Icon size={18} aria-hidden="true" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <footer className="border-t border-line mt-16">
        <div className="container-x py-10 grid gap-6 md:grid-cols-3 text-sm text-ink2">
          <div>
            <Logo size={22} />
            <p className="mt-3 max-w-xs">An open-source hotel search & reservation engine, wearing a real product. Catalogue and prices are synthetic.</p>
          </div>
          <div className="grid gap-2 content-start">
            <span className="eyebrow">Engine</span>
            <Link to="/how-it-works" className="hover:text-ink">Architecture & how it works</Link>
            <Link to="/admin" className="hover:text-ink">Ops dashboard</Link>
            <a href="https://github.com/D-L-Narayana/lodgic#benchmarks" className="hover:text-ink" rel="noopener noreferrer" target="_blank">Benchmarks</a>
          </div>
          <div className="grid gap-2 content-start">
            <span className="eyebrow">Source</span>
            <a href="https://github.com/D-L-Narayana/lodgic" className="hover:text-ink" rel="noopener noreferrer" target="_blank">github.com/D-L-Narayana/lodgic</a>
            <a href="https://github.com/D-L-Narayana" className="hover:text-ink" rel="noopener noreferrer" target="_blank">Built by D L Narayana</a>
            <span className="faint">MIT licensed · TypeScript · zero runtime dependencies</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Small pieces ---------- */
export function Stars({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-px text-gold ${className}`} role="img" aria-label={`${n}-star hotel`}>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      ))}
    </span>
  );
}

export function RatingBadge({ rating, reviews }: { rating: number; reviews: number }) {
  const word = rating >= 9 ? "Exceptional" : rating >= 8.5 ? "Excellent" : rating >= 8 ? "Very good" : rating >= 7 ? "Good" : "Fair";
  return (
    <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
      <span className="tabular inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-accent text-accent-ink px-1.5 font-bold text-xs">{rating.toFixed(1)}</span>
      <span className="font-medium">{word}</span>
      <span className="faint hidden sm:inline">· {reviews.toLocaleString()} reviews</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function HotelCardSkeleton() {
  return (
    <div className="card overflow-hidden grid sm:grid-cols-[260px_1fr]">
      <Skeleton className="h-48 sm:h-full rounded-none" />
      <div className="p-5 grid gap-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="flex justify-between items-end mt-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card p-10 text-center grid place-items-center gap-3 rise">
      <SearchX size={28} className="text-accent-text" aria-hidden="true" />
      <h2 className="text-lg">{title}</h2>
      <p className="muted max-w-md">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action }: { title?: string; body: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center grid place-items-center gap-3" role="alert">
      <AlertTriangle size={26} className="text-coral" aria-hidden="true" />
      <h2 className="text-lg">{title}</h2>
      <p className="muted max-w-md">{body}</p>
      {action}
    </div>
  );
}

/**
 * Image with skeleton + error fallback. The <img> is absolutely positioned inside the wrapper,
 * so the wrapper's height (from className) always wins — an image can never blow up a grid row.
 */
export function Img({ src, alt, className = "", sizes, priority = false }: { src: string; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const positioned = /\b(absolute|fixed)\b/.test(className);
  return (
    <div className={`${positioned ? "" : "relative"} overflow-hidden bg-bg2 ${className}`}>
      {state !== "ok" && <div className="absolute inset-0 skeleton rounded-none" aria-hidden="true" />}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center text-ink3 text-xs">Photo unavailable</div>
      ) : (
        <img
          src={src}
          alt={alt}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}

export function PageTitle({ eyebrow, title, lede, children }: { eyebrow?: string; title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)] leading-tight mt-1">{title}</h1>
        {lede && <p className="muted text-sm mt-1.5 max-w-2xl">{lede}</p>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "ok" | "coral" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink3">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular break-words ${tone === "ok" ? "text-ok" : tone === "coral" ? "text-coral" : ""}`}>{value}</div>
      {hint && <div className="text-xs faint mt-1">{hint}</div>}
    </div>
  );
}

/** Shared Recharts styling */
export const chartTooltip = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12, color: "var(--ink)", boxShadow: "var(--shadow)" },
  labelStyle: { color: "var(--ink-2)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "var(--ink)", padding: 0 },
  cursor: { stroke: "var(--line-strong)", fill: "var(--bg-2)", fillOpacity: 0.5 },
} as const;
export const chartTick = { fontSize: 11, fill: "var(--ink-3)" } as const;

export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs muted mb-2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
