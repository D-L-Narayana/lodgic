import { ArrowRight, Gauge, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { SearchBar } from "../components/SearchBar";
import { Img } from "../components/ui";
import { CITIES, addDays, cityPhoto, engine, today, toSearchParams } from "../lib/engine";

const FEATURED = ["Goa", "Paris", "Tokyo", "Bengaluru", "Lisbon", "Bali", "New York", "Dubai"];

export function Landing() {
  const roomTypes = engine.availability.registered;
  return (
    <div className="hero-bg">
      <section className="container-x pt-12 md:pt-20 pb-10">
        <div className="max-w-3xl rise">
          <span className="eyebrow">Search · Availability · Pricing · Ranking · Payments</span>
          <h1 className="mt-3 text-[clamp(2.1rem,1.4rem+3.2vw,3.6rem)] leading-[1.05]">
            Find the right stay, <em className="not-italic text-accent">priced live</em>, ranked for you.
          </h1>
          <p className="mt-4 text-[1.0625rem] muted max-w-2xl">
            {engine.hotels.length.toLocaleString()} hotels in {CITIES.length} cities with real-time availability, demand-based nightly rates and a learning-to-rank model that
            explains why each result is where it is. A complete booking product — running on an open-source engine, right here in your browser.
          </p>
        </div>
        <div className="mt-8 rise rise-d2">
          <SearchBar />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm rise rise-d3">
          <span className="faint">Try:</span>
          {["Goa", "Paris", "Tokyo", "Singapore"].map((c) => (
            <Link key={c} to={`/search?${toSearchParams({ city: c, checkIn: addDays(today, 14), checkOut: addDays(today, 17), guests: 2 }).toString()}`} className="chip hover:border-accent">
              {c} · next month
            </Link>
          ))}
        </div>
      </section>

      <section className="container-x py-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <span className="eyebrow">Destinations</span>
            <h2 className="text-xl mt-1">Where travellers are booking</h2>
          </div>
          <Link to="/search" className="btn btn-ghost btn-sm">
            All {CITIES.length} cities <ArrowRight size={14} />
          </Link>
        </div>
        <div className="rail">
          {FEATURED.map((name, i) => {
            const c = CITIES.find((x) => x.name === name)!;
            const count = engine.hotels.filter((h) => h.city === name).length;
            return (
              <Link key={name} to={`/search?${toSearchParams({ city: name, checkIn: addDays(today, 14 + i), checkOut: addDays(today, 17 + i), guests: 2 }).toString()}`} className="group relative w-56 h-72 rounded-xl2 overflow-hidden card hover-lift">
                <Img src={cityPhoto(name, 600)} alt={`${name}, ${c.country}`} className="absolute inset-0 h-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-0 p-4 text-white">
                  <div className="font-display text-xl">{name}</div>
                  <div className="text-xs opacity-90">{c.country} · {count} hotels · {c.currency}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container-x py-12">
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { icon: Layers, title: "Live availability", body: `${roomTypes.toLocaleString()} room types indexed in segment trees — every search checks real inventory for your nights, and sold-out rooms simply don't appear.` },
            { icon: Gauge, title: "Demand-based prices", body: "Nightly rates move with season, weekends and how full a hotel already is. Every quote is computed in integer minor units, so totals always add up." },
            { icon: Sparkles, title: "Ranking that explains itself", body: "A learning-to-rank model orders results and tells you why: “great price for the area”, “close to the centre”, “free cancellation”." },
            { icon: ShieldCheck, title: "Bookings that can't collide", body: "Holds are atomic and idempotent — two people can never take the last room, and a retried checkout never charges twice." },
          ].map((f, i) => (
            <div key={f.title} className={`card p-5 rise rise-d${i + 1}`}>
              <span className="grid place-items-center size-10 rounded-lg bg-accent-soft text-accent">
                <f.icon size={18} />
              </span>
              <h3 className="mt-3 text-base font-semibold font-body">{f.title}</h3>
              <p className="mt-1 text-sm muted">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 items-center text-sm">
          <Link to="/how-it-works" className="btn btn-soft btn-sm">
            See how the engine works <ArrowRight size={14} />
          </Link>
          <span className="faint">Open source · MIT · github.com/D-L-Narayana/lodgic</span>
        </div>
      </section>
    </div>
  );
}
