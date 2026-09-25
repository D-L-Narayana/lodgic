import { Check, LayoutList, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useTitle } from "../lib/theme";
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
  useTitle(`${q.city} stays — Lodgic`);

  // Lock body scroll while the mobile filter sheet is open; close it with Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

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
  const activeFilters = (q.minStars ? 1 : 0) + (q.maxNightlyPrice ? 1 : 0) + (q.amenities?.length ?? 0) + (q.freeCancellation ? 1 : 0) + (q.traveller ? 1 : 0);
  const resetFilters = () => setSp(toSearchParams({ city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, guests: q.guests, rooms: q.rooms }), { replace: true });

  return (
    <div className="container-x py-6">
      <SearchBar compact initial={q} />

      <div className="mt-5 grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Filters */}
        <aside className={`${filtersOpen ? "fixed inset-0 z-50 bg-bg p-4 pb-24 overflow-auto" : "hidden"} lg:block lg:static lg:p-0 lg:bg-transparent lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-auto`} aria-label="Filters" role={filtersOpen ? "dialog" : undefined} aria-modal={filtersOpen || undefined}>
          <div className="flex items-center justify-between lg:hidden mb-3">
            <h2 className="text-lg">Filters</h2>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <X size={16} />
            </button>
          </div>
          <div className="card p-4 grid gap-5 min-w-0">
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
                  <button key={v} type="button" onClick={() => update({ traveller: (v || undefined) as SearchQuery["traveller"] })} className="chip" aria-pressed={(q.traveller ?? "") === v}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Max nightly price {q.maxNightlyPrice ? `· ${formatMoney(q.maxNightlyPrice, hits[0]?.quote.currency ?? "INR")}` : "· any"}</span>
              <input type="range" className="range" min={500} max={maxPriceMajor} step={100} value={q.maxNightlyPrice ? q.maxNightlyPrice / 100 : maxPriceMajor} onChange={(e) => update({ maxNightlyPrice: Number(e.target.value) >= maxPriceMajor ? undefined : Number(e.target.value) * 100 })} aria-label="Maximum nightly price" aria-valuetext={q.maxNightlyPrice ? formatMoney(q.maxNightlyPrice, hits[0]?.quote.currency ?? "INR") : "any"} />
              <div className="flex justify-between text-xs faint"><span>500</span><span>{maxPriceMajor.toLocaleString()}+</span></div>
            </div>
            <div>
              <span className="label">Star rating</span>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" onClick={() => update({ minStars: q.minStars === s ? undefined : s })} className="chip" aria-pressed={q.minStars === s}>
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
                    <label key={k} className="check">
                      <input type="checkbox" checked={on} onChange={() => {
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
            <label className="check">
              <input type="checkbox" checked={!!q.freeCancellation} onChange={(e) => update({ freeCancellation: e.target.checked || undefined })} />
              Free cancellation only
            </label>
            <div>
              <span className="label">Show prices in</span>
              <select className="input" value={q.currency ?? ""} onChange={(e) => update({ currency: (e.target.value || undefined) as SearchQuery["currency"] })}>
                <option value="">Hotel currency</option>
                {["INR", "USD", "EUR", "GBP", "JPY", "SGD", "AED"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters} disabled={activeFilters === 0}>
              Reset filters{activeFilters ? ` (${activeFilters})` : ""}
            </button>
            <button type="button" className="btn btn-primary lg:hidden" onClick={() => setFiltersOpen(false)}><Check size={16} aria-hidden="true" /> Show {state.status === "ok" ? `${state.total} ` : ""}results</button>
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
              <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen}>
                <SlidersHorizontal size={14} aria-hidden="true" /> Filters{activeFilters ? <span className="chip chip-accent h-5 px-1.5 text-[11px]">{activeFilters}</span> : null}
              </button>
              <div className="seg" role="group" aria-label="View">
                <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
                  <LayoutList size={14} aria-hidden="true" /> List
                </button>
                <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
                  <MapIcon size={14} aria-hidden="true" /> Map
                </button>
              </div>
            </div>
          </div>

          {state.status === "loading" && (
            <div className="grid gap-4">{Array.from({ length: 4 }, (_, i) => <HotelCardSkeleton key={i} />)}</div>
          )}
          {state.status === "error" && <ErrorState body={state.message} action={<Link to="/" className="btn btn-primary btn-sm">Start a new search</Link>} />}
          {state.status === "ok" && hits.length === 0 && (
            <EmptyState title={`Nothing free in ${q.city} for these filters`} body="Every room type that fits your party is either sold out for those nights or filtered out. Loosen a filter, or try dates a few days later — prices are lower midweek and outside Oct–Feb." action={<button type="button" className="btn btn-primary btn-sm" onClick={resetFilters}>Clear filters</button>} />
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
      <Link to={to} className="block relative h-52 sm:h-full sm:min-h-56" aria-hidden tabIndex={-1}>
        <Img src={hotelPhotos(hotel.id, 1, 640)[0]!} alt="" className="absolute inset-0" />
      </Link>
      <div className="p-4 sm:p-5 grid gap-2 content-start">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs faint">
              <span className="tabular">#{rank}</span>
              <Stars n={hotel.stars} />
              <span className="truncate">{hotel.distanceToCentreKm.toFixed(1)} km from centre</span>
            </div>
            <h2 className="text-lg leading-tight mt-0.5 truncate">
              <Link to={to} className="hover:text-accent-text transition-colors">{hotel.name}</Link>
            </h2>
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
          <div className="text-xs faint" title={`Ranking score ${hit.score.toFixed(3)}`}>
            {unitsLeft <= 2 ? <span className="text-coral font-semibold">Only {unitsLeft} left at this price</span> : <span>{unitsLeft} rooms left</span>}
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold tabular">{formatMoney(quote.total, quote.currency)}</div>
            <div className="text-xs faint">{quote.nights} night{quote.nights > 1 ? "s" : ""} · {quote.rooms} room{quote.rooms > 1 ? "s" : ""} · incl. taxes</div>
            <Link to={to} className="btn btn-primary btn-sm mt-2" aria-label={`See rooms at ${hotel.name}`}>See rooms</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
