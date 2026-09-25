import { Moon, Sun, Star, SearchX, AlertTriangle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

/* ---------- Logo: an "L" that is also a door key / room card, with a coral sun ---------- */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-display text-[1.35rem] font-semibold tracking-tight text-ink">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Lodgic" role="img" fill="none">
        <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeWidth="1.5" className="text-accent" />
        <path d="M10 8v16h13v-3.6h-9.2V8z" fill="currentColor" className="text-accent" />
        <circle cx="22.5" cy="11" r="2.6" fill="var(--coral)" />
      </svg>
      Lodgic
    </span>
  );
}

/* ---------- Theme ---------- */
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("lodgic-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} className="btn btn-ghost btn-sm w-9 px-0" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme">
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/* ---------- Layout ---------- */
const nav = [
  { to: "/search", label: "Search" },
  { to: "/bookings", label: "My bookings" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/admin", label: "Ops" },
];

export function Layout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/80 border-b border-line">
        <div className="container-x h-16 flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0" aria-label="Lodgic home">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `px-3 h-9 inline-flex items-center rounded-lg text-sm font-medium transition-colors ${isActive ? "bg-accent-soft text-ink" : "text-ink2 hover:text-ink hover:bg-bg2"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="https://github.com/D-L-Narayana/lodgic" className="btn btn-ghost btn-sm hidden sm:inline-flex" rel="noopener">
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <nav className="md:hidden sticky bottom-0 z-40 bg-card/95 backdrop-blur border-t border-line grid grid-cols-4" aria-label="Mobile">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `h-14 flex items-center justify-center text-xs font-semibold ${isActive ? "text-accent" : "text-ink2"}`}>
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
          <div className="grid gap-2">
            <span className="eyebrow">Engine</span>
            <Link to="/how-it-works" className="hover:text-ink">Architecture & how it works</Link>
            <Link to="/admin" className="hover:text-ink">Ops dashboard</Link>
            <a href="https://github.com/D-L-Narayana/lodgic#benchmarks" className="hover:text-ink" rel="noopener">Benchmarks</a>
          </div>
          <div className="grid gap-2">
            <span className="eyebrow">Source</span>
            <a href="https://github.com/D-L-Narayana/lodgic" className="hover:text-ink" rel="noopener">github.com/D-L-Narayana/lodgic</a>
            <a href="https://github.com/D-L-Narayana" className="hover:text-ink" rel="noopener">Built by D L Narayana</a>
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
    <span className={`inline-flex items-center gap-px text-gold ${className}`} aria-label={`${n} star hotel`}>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} size={12} fill="currentColor" strokeWidth={0} />
      ))}
    </span>
  );
}

export function RatingBadge({ rating, reviews }: { rating: number; reviews: number }) {
  const word = rating >= 9 ? "Exceptional" : rating >= 8.5 ? "Excellent" : rating >= 8 ? "Very good" : rating >= 7 ? "Good" : "Fair";
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="tabular inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-accent text-accent-ink px-1.5 font-bold text-xs">{rating.toFixed(1)}</span>
      <span className="font-medium">{word}</span>
      <span className="faint">· {reviews.toLocaleString()} reviews</span>
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
      <span className="grid place-items-center size-14 rounded-full bg-accent-soft text-accent">
        <SearchX size={26} />
      </span>
      <h3 className="text-lg">{title}</h3>
      <p className="muted max-w-md">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action }: { title?: string; body: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center grid place-items-center gap-3 border-coral/40" role="alert">
      <span className="grid place-items-center size-12 rounded-full bg-coral-soft text-coral">
        <AlertTriangle size={22} />
      </span>
      <h3 className="text-lg">{title}</h3>
      <p className="muted max-w-md">{body}</p>
      {action}
    </div>
  );
}

export function Img({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <div className={`relative overflow-hidden bg-bg2 ${className}`}>
      {state !== "ok" && <div className="absolute inset-0 skeleton rounded-none" aria-hidden="true" />}
      {state === "error" ? (
        <div className="absolute inset-0 grid place-items-center text-ink3 text-xs">Photo unavailable</div>
      ) : (
        <img src={src} alt={alt} loading="lazy" decoding="async" onLoad={() => setState("ok")} onError={() => setState("error")} className={`h-full w-full object-cover transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"}`} />
      )}
    </div>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)] leading-tight mt-1">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "ok" | "coral" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink3">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular ${tone === "ok" ? "text-ok" : tone === "coral" ? "text-coral" : ""}`}>{value}</div>
      {hint && <div className="text-xs faint mt-1">{hint}</div>}
    </div>
  );
}
