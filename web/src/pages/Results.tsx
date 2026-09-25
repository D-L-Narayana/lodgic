import { LayoutList, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SearchBar } from "../components/SearchBar";
import { EmptyState, ErrorState, HotelCardSkeleton, Img, RatingBadge, Stars } from "../components/ui";
import { AMENITY_LABEL, SORT_LABEL, formatMoney, hotelPhotos, parseSearchParams, runSearch, toSearchParams, type SearchHit, type SearchQuery } from "../lib/engine";

const MapView = lazy(() => import("../components/MapView"));

type SearchState = { status: "loading" } | { status: "ok"; hits: SearchHit[]; total: number; tookMs: number; cache: "hit" | "miss" } | { status: "error"; message: string };

export function Results() {
  const [sp, setSp] = useSearchParams();
  const q = useMemo(() => parseSearchParams(sp), [sp]);
  const [state, setState] = useState<SearchState>({ status: "loading" });
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    setState({ status: "loading" });
    const id = window.setTimeout(() => {
      try {
        const res = runSearch(q);
        setState({ status: "ok", hits: [...res.hits], total: res.total, tookMs: res.tookMs, cache: res.cache });
      } catch (e) {
        setState({ status: "error", message: (e as Error).message });
      }
    }, 120); // let the skeleton paint; the engine itself answers in a few ms
    return () => window.clearTimeout(id);
  }, [q]);

  function update(patch: Partial<SearchQuery>) {
    const next: Partial<SearchQuery> = { ...q, ...patch };
    setSp(toSearchParams(next), { replace: true });
  }

  const hits = state.status === "ok" ? state.hits : [];
  const maxPriceMajor = useMemo(() => Math.max(5_000, ...hits.map((h) => Math.ceil(h.quote.averageNightly / 100))), [hits]);

  return (
    <div className="container-x py-6">
      <SearchBar compact initial={q} />

      <div className="mt-5 grid lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* Filters */}
        <aside className={`${filtersOpen ? "fixed inset-0 z-50 bg-bg p-4 overflow-auto" : "hidden"} lg:block lg:static lg:p-0 lg:bg-transparent`} aria-label="Filters">
          <div className="flex items-center justify-between lg:hidden mb-3">
            <h2 className="text-lg">Filters</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <X size={16} />
            </button>
          </div>
          <div className="card p-4 grid gap-5">
            <div>
              <span className="label">Sort by</span>
              <select className="input" value={q.sort} onChange={(e) => update({ sort: e.target.value as SearchQuery["sort"] })}>
                {Object.entries(SORT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">Personalise ranking</span>
              <div className="flex flex-wrap gap-1.5">
                {[["", "Default"], ["budget", "Budget"], ["business", "Business"], ["family", "Family"], ["leisure", "Leisure"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => update({ traveller: (v || undefined) as SearchQuery["traveller"] })} className={`chip ${(q.traveller ?? "") === v ? "chip-accent" : "hover:border-ink3"}`} aria-pressed={(q.traveller ?? "") === v}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Max nightly price {q.maxNightlyPrice ? `· ${formatMoney(q.maxNightlyPrice, hits[0]?.quote.currency ?? "INR")}` : "· any"}</span>
              <input type="range" min={500} max={maxPriceMajor} step={100} value={q.maxNightlyPrice ? q.maxNightlyPrice / 100 : maxPriceMajor} onChange={(e) => update({ maxNightlyPrice: Number(e.target.value) >= maxPriceMajor ? undefined : Number(e.target.value) * 100 })} aria-label="Maximum nightly price" />
              <div className="flex justify-between text-xs faint"><span>500</span><span>{maxPriceMajor.toLocaleString()}+</span></div>
            </div>
            <div>
              <span className="label">Star rating</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" onClick={() => update({ minStars: q.minStars === s ? undefined : s })} className={`chip ${q.minStars === s ? "chip-accent" : "hover:border-ink3"}`} aria-pressed={q.minStars === s}>
                    {s}★+
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Amenities</span>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(AMENITY_LABEL).map(([k, v]) => {
                  const on = q.amenities?.includes(k as never) ?? false;
                  return (
                    <label key={k} className={`flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg border cursor-pointer ${on ? "border-accent bg-accent-soft" : "border-line hover:border-ink3"}`}>
                      <input type="checkbox" className="accent-[var(--accent)]" checked={on} onChange={() => {
                        const set = new Set(q.amenities ?? []);
                        on ? set.delete(k as never) : set.add(k as never);
                        update({ amenities: set.size ? [...set] : undefined });
                      }} />
                      {v}
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[var(--accent)]" checked={!!q.freeCancellation} onChange={(e) => update({ freeCancellation: e.target.checked || undefined })} />
              Free cancellation only
            </label>
            <div>
              <span className="label">Show prices in</span>
              <select className="input" value={q.currency ?? ""} onChange={(e) => update({ currency: (e.target.value || undefined) as SearchQuery["currency"] })}>
                <option value="">Hotel currency</option>
                {["INR", "USD", "EUR", "GBP", "JPY", "SGD", "AED"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSp(toSearchParams({ city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, guests: q.guests, rooms: q.rooms }), { replace: true })}>
              Reset filters
            </button>
            <button type="button" className="btn btn-primary lg:hidden" onClick={() => setFiltersOpen(false)}>Show {state.status === "ok" ? state.total : ""} results</button>
          </div>
        </aside>

        {/* Results */}
        <section aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl">
                {q.city}: {state.status === "ok" ? `${state.total} stay${state.total === 1 ? "" : "s"} available` : state.status === "loading" ? "searching…" : "search failed"}
              </h1>
              {state.status === "ok" && (
                <p className="text-sm faint tabular">
                  {state.cache === "hit" ? "served from the search cache" : "computed live"} in {state.tookMs.toFixed(1)} ms · sorted by {SORT_LABEL[q.sort ?? "recommended"]}
                  {q.traveller ? ` · tuned for ${q.traveller} travellers` : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={14} /> Filters
              </button>
              <div className="inline-flex rounded-lg border border-line p-0.5 bg-card" role="tablist" aria-label="View">
                <button role="tab" aria-selected={view === "list"} className={`btn btn-sm border-0 ${view === "list" ? "bg-accent-soft" : ""}`} onClick={() => setView("list")}>
                  <LayoutList size={14} /> List
                </button>
                <button role="tab" aria-selected={view === "map"} className={`btn btn-sm border-0 ${view === "map" ? "bg-accent-soft" : ""}`} onClick={() => setView("map")}>
                  <MapIcon size={14} /> Map
                </button>
              </div>
            </div>
          </div>

          {state.status === "loading" && (
            <div className="grid gap-4">{Array.from({ length: 4 }, (_, i) => <HotelCardSkeleton key={i} />)}</div>
          )}
          {state.status === "error" && <ErrorState body={state.message} action={<Link to="/" className="btn btn-primary btn-sm">Start a new search</Link>} />}
          {state.status === "ok" && hits.length === 0 && (
            <EmptyState title={`Nothing free in ${q.city} for these filters`} body="Every room type that fits your party is either sold out for those nights or filtered out. Loosen a filter, or try dates a few days later — prices are lower midweek and outside Oct–Feb." action={<button className="btn btn-primary btn-sm" onClick={() => setSp(toSearchParams({ city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, guests: q.guests, rooms: q.rooms }), { replace: true })}>Clear filters</button>} />
          )}

          {state.status === "ok" && hits.length > 0 && view === "map" && (
            <Suspense fallback={<div className="skeleton h-[560px]" />}>
              <MapView hits={hits} active={active} onActive={setActive} query={q} />
            </Suspense>
          )}

          {state.status === "ok" && hits.length > 0 && view === "list" && (
            <ol className="grid gap-4">
              {hits.map((h, i) => (
                <li key={h.hotel.id} className={`rise ${i < 4 ? `rise-d${i + 1}` : ""}`} style={{ animationDelay: i > 3 ? `${Math.min(i, 12) * 40}ms` : undefined }}>
                  <HotelCard hit={h} rank={i + 1} query={q} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

export function HotelCard({ hit, rank, query }: { hit: SearchHit; rank: number; query: SearchQuery }) {
  const { hotel, roomType, quote, unitsLeft } = hit;
  const to = `/hotel/${hotel.id}?${toSearchParams(query).toString()}`;
  return (
    <article className="card overflow-hidden grid sm:grid-cols-[260px_1fr] hover-lift">
      <Link to={to} className="block h-52 sm:h-full" aria-hidden tabIndex={-1}>
        <Img src={hotelPhotos(hotel.id, 1, 640)[0]!} alt="" className="h-full" />
      </Link>
      <div className="p-4 sm:p-5 grid gap-2 content-start">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs faint">
              <span className="tabular">#{rank}</span>
              <Stars n={hotel.stars} />
              <span className="truncate">{hotel.distanceToCentreKm.toFixed(1)} km from centre</span>
            </div>
            <h3 className="text-lg leading-tight mt-0.5 truncate">
              <Link to={to} className="hover:text-accent">{hotel.name}</Link>
            </h3>
          </div>
          <RatingBadge rating={hotel.rating} reviews={hotel.reviewCount} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hit.explanation.map((e) => (
            <span key={e} className="chip chip-accent">{e}</span>
          ))}
          {roomType.breakfastIncluded && <span className="chip">Breakfast included</span>}
          {roomType.refundable ? <span className="chip chip-ok">Free cancellation</span> : <span className="chip">Non-refundable</span>}
        </div>
        <div className="text-sm muted">{roomType.name} · sleeps {roomType.capacity} · {hotel.amenities.slice(0, 4).map((a) => AMENITY_LABEL[a]).join(", ")}</div>
        <div className="flex items-end justify-between gap-3 mt-1">
          <div className="text-xs faint">
            {unitsLeft <= 2 ? <span className="text-coral font-semibold">Only {unitsLeft} left at this price</span> : <span>{unitsLeft} rooms left</span>} · ranking score {hit.score.toFixed(3)}
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold tabular">{formatMoney(quote.total, quote.currency)}</div>
            <div className="text-xs faint">{quote.nights} night{quote.nights > 1 ? "s" : ""} · {quote.rooms} room{quote.rooms > 1 ? "s" : ""} · incl. taxes</div>
            <Link to={to} className="btn btn-primary btn-sm mt-2">See rooms</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
