import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { SearchBar } from "../components/SearchBar";
import { Img } from "../components/ui";
import { CITIES, addDays, cityPhoto, engine, today, toSearchParams } from "../lib/engine";
import { useTitle } from "../lib/theme";

const FEATURED = ["Goa", "Paris", "Tokyo", "Bengaluru", "Lisbon", "Bali", "New York", "Dubai"];

export function Landing() {
  useTitle("Lodgic — hotel search & reservation engine");
  const roomTypes = engine.availability.registered;
  const pillars = [
    { n: "01", title: "Live availability", body: `${roomTypes.toLocaleString()} room types are indexed in segment trees. Every search checks real inventory for your nights, and sold-out rooms simply don't appear.` },
    { n: "02", title: "Demand-based prices", body: "Nightly rates move with season, weekends and how full a hotel already is. Every quote is computed in integer minor units, so totals always add up." },
    { n: "03", title: "Ranking that explains itself", body: "A learning-to-rank model orders results and says why: “great price for the area”, “close to the centre”, “free cancellation”." },
    { n: "04", title: "Bookings that can't collide", body: "Holds are atomic and idempotent — two people can never take the last room, and a retried checkout never charges twice." },
  ];
  return (
    <div className="hero-bg">
      <section className="container-x pt-12 md:pt-20 pb-10">
        <div className="max-w-3xl rise">
          <span className="eyebrow">Search · Availability · Pricing · Ranking · Payments</span>
          <h1 className="mt-3 text-[clamp(2.1rem,1.4rem+3.2vw,3.6rem)] leading-[1.05]">
            Find the right stay, <em className="not-italic text-accent-text">priced live</em>, ranked for you.
          </h1>
          <p className="mt-4 text-[1.0625rem] muted max-w-2xl">
            {engine.hotels.length.toLocaleString()} hotels in {CITIES.length} cities with real-time availability, demand-based nightly rates and a learning-to-rank model that explains why each result is where it is. A complete booking product, running on an open-source engine right here in your browser.
          </p>
        </div>
        <div className="mt-8 rise rise-d2">
          <SearchBar />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm rise rise-d3">
          <span className="faint">Try:</span>
          {["Goa", "Paris", "Tokyo", "Singapore"].map((c) => (
            <Link key={c} to={`/search?${toSearchParams({ city: c, checkIn: addDays(today, 14), checkOut: addDays(today, 17), guests: 2 }).toString()}`} className="chip hover:border-ink3 transition-colors">
              {c} · next month
            </Link>
          ))}
        </div>
      </section>

      <section className="container-x py-10" aria-labelledby="dest-h">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <span className="eyebrow">Destinations</span>
            <h2 id="dest-h" className="text-xl mt-1">Where travellers are booking</h2>
          </div>
          <Link to="/search" className="btn btn-ghost btn-sm shrink-0">
            All {CITIES.length} cities <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className="rail" role="list">
          {FEATURED.map((name, i) => {
            const c = CITIES.find((x) => x.name === name)!;
            const count = engine.hotels.filter((h) => h.city === name).length;
            return (
              <Link key={name} role="listitem" to={`/search?${toSearchParams({ city: name, checkIn: addDays(today, 14 + i), checkOut: addDays(today, 17 + i), guests: 2 }).toString()}`} className="group relative w-56 h-72 rounded-xl2 overflow-hidden card hover-lift" aria-label={`Search stays in ${name}, ${c.country}`}>
                <Img src={cityPhoto(name, 600)} alt="" className="absolute inset-0" priority={i < 4} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" aria-hidden="true" />
                <div className="absolute bottom-0 p-4 text-white">
                  <div className="font-display text-xl">{name}</div>
                  <div className="text-xs opacity-90">{c.country} · {count} hotels · {c.currency}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container-x py-12" aria-labelledby="engine-h">
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-8 lg:gap-14 items-start">
          <div className="lg:sticky lg:top-24">
            <span className="eyebrow">The engine</span>
            <h2 id="engine-h" className="text-[clamp(1.5rem,1.1rem+1.5vw,2.2rem)] leading-tight mt-2">One engine, three hosts: the browser, a Node API and a serverless function run the same TypeScript.</h2>
            <p className="muted mt-3 max-w-md">No runtime dependencies, integer money, atomic holds and an explainable ranker — measured, tested and open source.</p>
            <div className="mt-5 flex flex-wrap gap-3 items-center text-sm">
              <Link to="/how-it-works" className="btn btn-soft btn-sm">
                See how it works <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <a href="https://github.com/D-L-Narayana/lodgic" className="link" rel="noopener noreferrer" target="_blank">Source on GitHub</a>
            </div>
          </div>
          <ol className="grid gap-0 divide-y divide-line border-y border-line">
            {pillars.map((f, i) => (
              <li key={f.title} className={`grid grid-cols-[3rem_1fr] gap-4 py-5 rise rise-d${i + 1}`}>
                <span className="font-display text-2xl text-accent-text/70 leading-none pt-0.5">{f.n}</span>
                <div>
                  <h3 className="text-base font-semibold font-body">{f.title}</h3>
                  <p className="mt-1 text-sm muted max-w-prose">{f.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
