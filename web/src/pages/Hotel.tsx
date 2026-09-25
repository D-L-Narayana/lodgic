import { ArrowLeft, BedDouble, Check, ChevronLeft, ChevronRight, MapPin, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTitle } from "../lib/theme";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { isoToDay } from "../../../src/core/calendar.js";
import { quote as quoteFor } from "../../../src/core/pricing.js";
import { explain, featureVector, scoreCandidate } from "../../../src/core/ranking.js";
import { SearchBar } from "../components/SearchBar";
import { EmptyState, Img, RatingBadge, Stars } from "../components/ui";
import { AMENITY_LABEL, engine, fmtDate, formatMoney, hotelPhotos, parseSearchParams, toSearchParams } from "../lib/engine";

export function HotelPage() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const q = useMemo(() => parseSearchParams(sp), [sp]);
  const navigate = useNavigate();
  const hotel = engine.hotelById.get(id);
  const [photo, setPhoto] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useTitle(hotel ? `${hotel.name}, ${hotel.city} — Lodgic` : "Hotel not found — Lodgic");

  if (!hotel) {
    return (
      <div className="container-x py-10">
        <EmptyState title="We can't find that hotel" body="The link may be out of date. Search again to see live availability." action={<Link to="/" className="btn btn-primary btn-sm">Back to search</Link>} />
      </div>
    );
  }

  const start = isoToDay(q.checkIn);
  const end = isoToDay(q.checkOut);
  const rooms = q.rooms ?? 1;
  const perRoom = Math.ceil(q.guests / rooms);
  const photos = hotelPhotos(hotel.id, 5, 1200);

  const offers = hotel.roomTypes.map((room) => {
    const left = engine.availability.unitsLeft(room.id, start, end);
    const occupancy = engine.availability.occupancy(room.id, start, end);
    const pq = quoteFor(room, hotel.currency, start, end, rooms, occupancy, q.currency ?? hotel.currency);
    const fits = room.capacity >= perRoom;
    const scored = scoreCandidate(featureVector(hotel, room, pq), undefined, q.traveller);
    return { room, left, occupancy, quote: pq, fits, available: fits && left >= rooms, score: scored.score, why: explain(scored) };
  });
  const chosen = offers.find((o) => o.room.id === selected) ?? offers.find((o) => o.available);

  return (
    <div className="container-x py-6">
      <div className="mb-4">
        <SearchBar compact initial={q} />
      </div>
      <Link to={`/search?${toSearchParams(q).toString()}`} className="inline-flex items-center gap-1 text-sm muted hover:text-ink mb-3">
        <ArrowLeft size={14} /> Back to {q.city} results
      </Link>

      {/* Gallery — every image is absolutely positioned inside a fixed-height cell, so nothing can overflow */}
      <div className="grid md:grid-cols-[2fr_1fr] gap-2 h-[300px] sm:h-[360px] md:h-[440px] rise">
        <div className="relative min-h-0 rounded-xl2 overflow-hidden group bg-bg2">
          <Img key={photos[photo]} src={photos[photo]!} alt={`${hotel.name} photo ${photo + 1} of ${photos.length}`} className="absolute inset-0" priority />
          <button type="button" onClick={() => setPhoto((photo + photos.length - 1) % photos.length)} className="btn btn-icon absolute left-3 top-1/2 -translate-y-1/2 bg-card/90 text-ink shadow-card hover:bg-card" aria-label="Previous photo"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setPhoto((photo + 1) % photos.length)} className="btn btn-icon absolute right-3 top-1/2 -translate-y-1/2 bg-card/90 text-ink shadow-card hover:bg-card" aria-label="Next photo"><ChevronRight size={18} /></button>
          <span className="absolute bottom-3 left-3 chip chip-dark tabular" aria-live="polite">{photo + 1} / {photos.length}</span>
        </div>
        <div className="hidden md:grid grid-rows-2 gap-2 min-h-0">
          {photos.slice(1, 3).map((src, i) => (
            <button key={src} type="button" onClick={() => setPhoto(i + 1)} className={`relative min-h-0 rounded-xl2 overflow-hidden ${photo === i + 1 ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""}`} aria-label={`Show photo ${i + 2}`} aria-pressed={photo === i + 1}>
              <Img src={src} alt="" className="absolute inset-0" />
            </button>
          ))}
        </div>
      </div>
      <div className="rail mt-2" role="list" aria-label="All photos">
        {photos.map((src, i) => (
          <button key={src} type="button" role="listitem" onClick={() => setPhoto(i)} className={`relative size-16 rounded-lg overflow-hidden ${photo === i ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : "opacity-80 hover:opacity-100"}`} aria-label={`Show photo ${i + 1}`} aria-pressed={photo === i}>
            <Img src={src.replace("w=1200", "w=200")} alt="" className="absolute inset-0" />
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8 mt-6">
        <div className="grid gap-8">
          <header className="rise rise-d1">
            <div className="flex items-center gap-2 text-sm faint">
              <Stars n={hotel.stars} /> <span>{hotel.stars}-star hotel</span>
            </div>
            <h1 className="text-[clamp(1.6rem,1.2rem+1.5vw,2.4rem)] leading-tight mt-1">{hotel.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <RatingBadge rating={hotel.rating} reviews={hotel.reviewCount} />
              <span className="inline-flex items-center gap-1 muted">
                <MapPin size={14} /> {hotel.city}, {hotel.country} · {hotel.distanceToCentreKm.toFixed(1)} km from centre
              </span>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {hotel.amenities.map((a) => (
                <li key={a} className="chip">
                  <Check size={12} className="text-ok" /> {AMENITY_LABEL[a]}
                </li>
              ))}
            </ul>
            <p className="mt-4 muted max-w-2xl">
              {hotel.name} is a {hotel.stars}-star property in {hotel.city} with {hotel.roomTypes.length} room types and {hotel.roomTypes.reduce((n, r) => n + r.totalUnits, 0)} rooms. Rated {hotel.rating.toFixed(1)} by {hotel.reviewCount.toLocaleString()} guests.
              Prices below are computed live for {fmtDate(q.checkIn)} – {fmtDate(q.checkOut)} from the hotel's base rates, season, weekday and how full each room type already is.
            </p>
          </header>

          <section className="rise rise-d2" aria-labelledby="rooms-h">
            <h2 id="rooms-h" className="text-xl mb-3">Choose your room</h2>
            <div className="grid gap-3">
              {offers.map((o) => (
                <button
                  key={o.room.id}
                  type="button"
                  disabled={!o.available}
                  onClick={() => setSelected(o.room.id)}
                  className={`card p-4 text-left grid sm:grid-cols-[1fr_auto] gap-3 transition-[border-color,box-shadow] ${chosen?.room.id === o.room.id && o.available ? "border-accent shadow-[0_0_0_3px_var(--ring)]" : ""} ${o.available ? "hover:border-ink3 cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
                  aria-pressed={chosen?.room.id === o.room.id}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <BedDouble size={16} className="text-accent" />
                      <span className="font-semibold">{o.room.name}</span>
                      <span className="chip"><Users size={12} /> sleeps {o.room.capacity}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                      {o.room.refundable ? <span className="chip chip-ok">Free cancellation</span> : <span className="chip">Non-refundable</span>}
                      {o.room.breakfastIncluded && <span className="chip">Breakfast included</span>}
                      <span className="chip" title="Occupancy over your dates drives the demand uplift">{Math.round(o.occupancy * 100)}% booked</span>
                    </div>
                    {!o.fits && <p className="text-xs text-coral mt-2">Too small for {perRoom} guests per room — add rooms or pick a suite.</p>}
                    {o.fits && o.left < rooms && <p className="text-xs text-coral mt-2">Sold out for these dates.</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular">{formatMoney(o.quote.total, o.quote.currency)}</div>
                    <div className="text-xs faint">{formatMoney(o.quote.averageNightly, o.quote.currency)} / night avg · {o.quote.nights} nights</div>
                    {o.available && <div className={`text-xs mt-1 font-semibold ${o.left <= 2 ? "text-coral" : "text-ok"}`}>{o.left <= 2 ? `Only ${o.left} left` : `${o.left} available`}</div>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Live price breakdown */}
        <aside className="lg:sticky lg:top-20 self-start rise rise-d3">
          <div className="card p-5 grid gap-4">
            <div>
              <span className="eyebrow">Live price breakdown</span>
              <h2 className="text-lg mt-1">{chosen ? chosen.room.name : "No room available"}</h2>
              <p className="text-sm faint">{fmtDate(q.checkIn)} → {fmtDate(q.checkOut)} · {rooms} room{rooms > 1 ? "s" : ""}, {q.guests} guest{q.guests > 1 ? "s" : ""}</p>
            </div>
            {chosen ? (
              <>
                <table className="w-full text-sm tabular">
                  <tbody>
                    {chosen.quote.nightly.map((n, i) => {
                      const d = new Date(Date.parse(`${q.checkIn}T00:00:00Z`) + i * 86_400_000);
                      const weekend = [5, 6].includes(d.getUTCDay());
                      return (
                        <tr key={i} className="border-b border-line/60">
                          <td className="py-1.5 muted">{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}{weekend && <span className="chip chip-coral ml-2 h-5 text-[10px]">weekend</span>}</td>
                          <td className="py-1.5 text-right">{formatMoney(n, chosen.quote.currency)}</td>
                        </tr>
                      );
                    })}
                    <tr><td className="pt-2 muted">Rooms subtotal ({rooms}×)</td><td className="pt-2 text-right">{formatMoney(chosen.quote.roomsSubtotal, chosen.quote.currency)}</td></tr>
                    <tr><td className="muted">Length-of-stay discount</td><td className={`text-right ${chosen.quote.lengthOfStayDiscount < 0 ? "text-ok" : ""}`}>{formatMoney(chosen.quote.lengthOfStayDiscount, chosen.quote.currency)}</td></tr>
                    <tr><td className="muted">Taxes & fees (12%)</td><td className="text-right">{formatMoney(chosen.quote.taxesAndFees, chosen.quote.currency)}</td></tr>
                    <tr className="text-base font-semibold"><td className="pt-2">Total</td><td className="pt-2 text-right">{formatMoney(chosen.quote.total, chosen.quote.currency)}</td></tr>
                  </tbody>
                </table>
                <div className="text-xs faint grid gap-1">
                  <span>Demand uplift for {Math.round(chosen.occupancy * 100)}% occupancy is already included. {chosen.quote.nights >= 3 ? "Stays of 3+ nights get a length-of-stay discount." : "Stay 3+ nights for a length-of-stay discount."}</span>
                  <span>Why it ranks here: {chosen.why.join(" · ")}<span className="sr-only"> (model score {chosen.score.toFixed(3)})</span></span>
                </div>
                <button type="button" className="btn btn-primary btn-lg w-full" onClick={() => navigate(`/checkout/${hotel.id}/${chosen.room.id}?${toSearchParams(q).toString()}`)}>
                  Reserve {chosen.room.name}
                </button>
                <p className="text-xs faint text-center">You won't be charged yet — we hold the room for 10 minutes while you pay.</p>
              </>
            ) : (
              <p className="muted text-sm">Every room type is sold out or too small for your party on these dates. Try nearby dates or fewer guests per room.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
