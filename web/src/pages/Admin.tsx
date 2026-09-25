import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isoToDay } from "../../../src/core/calendar.js";
import { RANKER_MODEL } from "../../../src/core/model.js";
import { ChartLegend, PageTitle, Stat, chartTick, chartTooltip } from "../components/ui";
import { CITIES, addDays, engine, formatMoney, runSearch, telemetry, today } from "../lib/engine";
import { useTitle } from "../lib/theme";

const C = { accent: "var(--accent)", coral: "var(--coral)", gold: "var(--gold)", ok: "var(--ok)", ink3: "var(--ink-3)", a: "var(--chart-a)" };

function pct(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

/** Warm-up traffic so a cold visit shows meaningful latency/cache numbers (a mix of misses and repeats). Runs once, before first paint. */
function warmUp(): void {
  if (telemetry.searches.length >= 8) return;
  const cities = ["Goa", "Paris", "Tokyo", "Bengaluru", "London", "Dubai", "Goa", "Paris", "Tokyo", "Goa", "Singapore", "Paris"];
  cities.forEach((city, i) => runSearch({ city, checkIn: addDays(today, 10 + (i % 3)), checkOut: addDays(today, 13 + (i % 3)), guests: 2, pageSize: 20 }));
}

export function Admin() {
  useTitle("Ops dashboard — Lodgic");
  const [, tick] = useState(() => {
    warmUp();
    return 0;
  });
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  // Occupancy over the next 90 days for a sample of hotels in a few cities (materialises trees lazily — visible in the counter).
  const occupancy = useMemo(() => {
    const cities = ["Goa", "Paris", "Tokyo", "Bengaluru"];
    const days = Array.from({ length: 13 }, (_, i) => i * 7);
    return days.map((offset) => {
      const start = isoToDay(addDays(today, offset));
      const row: Record<string, number | string> = { week: `+${offset}d` };
      for (const city of cities) {
        const hotels = engine.hotels.filter((h) => h.city === city).slice(0, 12);
        let occ = 0;
        let n = 0;
        for (const h of hotels)
          for (const r of h.roomTypes) {
            occ += engine.availability.occupancy(r.id, start, start + 7);
            n++;
          }
        row[city] = Math.round((occ / Math.max(1, n)) * 100);
      }
      return row;
    });
  }, []);

  const reservations = engine.reservations.list();
  const confirmed = reservations.filter((r) => r.status === "CONFIRMED");
  const revenue = confirmed.reduce((s, r) => s + r.quote.total, 0);
  const cache = engine.search.cacheStats();
  const lat = telemetry.searches.map((s) => s.ms);
  const cold = telemetry.searches.filter((s) => s.cache === "miss").map((s) => s.ms);
  const warm = telemetry.searches.filter((s) => s.cache === "hit").map((s) => s.ms);

  const latencySeries = telemetry.searches.slice(-40).map((s, i) => ({ i: i + 1, ms: Math.round(s.ms * 100) / 100, cache: s.cache, city: s.city }));
  const starMix = [5, 4, 3, 2, 1].map((s) => ({ name: `${s}★`, value: engine.hotels.filter((h) => h.stars === s).length }));
  const starTotal = starMix.reduce((a, b) => a + b.value, 0);
  const byCity = CITIES.map((c) => ({ city: c.name, hotels: engine.hotels.filter((h) => h.city === c.name).length, level: c.priceLevel })).sort((a, b) => b.level - a.level).slice(0, 8);
  const weights = RANKER_MODEL.features.map((f, i) => ({ feature: f.replace(/_/g, " "), weight: RANKER_MODEL.weights[i]! }));
  const statusMix = ["HELD", "CONFIRMED", "CANCELLED", "EXPIRED"].map((s) => ({ name: s, value: reservations.filter((r) => r.status === s).length }));
  const cityLines: [string, string][] = [["Goa", C.accent], ["Paris", C.coral], ["Tokyo", C.gold], ["Bengaluru", C.ok]];

  return (
    <div className="container-x py-8">
      <PageTitle eyebrow="Ops" title="Engine dashboard" lede="Live numbers from the engine running in this tab — refreshes every 2 seconds.">
        <span className="chip" aria-live="off">this browser session</span>
      </PageTitle>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rise">
        <Stat label="Catalogue" value={engine.hotels.length.toLocaleString()} hint={`${engine.availability.registered.toLocaleString()} room types · ${CITIES.length} cities`} />
        <Stat label="Availability trees materialised" value={engine.availability.materialised.toLocaleString()} hint={`lazy — ${((engine.availability.materialised / engine.availability.registered) * 100).toFixed(1)}% of room types touched · boot ${telemetry.bootMs} ms`} />
        <Stat label="Search cache hit rate" value={`${(cache.hitRate * 100).toFixed(0)}%`} hint={`${cache.hits} hits · ${cache.misses} misses · ${cache.size} entries`} tone={cache.hitRate > 0.5 ? "ok" : "default"} />
        <Stat label="Search latency p50 / p95" value={lat.length ? `${pct(lat, 50).toFixed(1)} / ${pct(lat, 95).toFixed(1)} ms` : "—"} hint={lat.length ? `${lat.length} searches · cold ${cold.length ? pct(cold, 50).toFixed(1) : "–"} ms · warm ${warm.length ? pct(warm, 50).toFixed(2) : "–"} ms` : "run a search to populate"} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3 rise rise-d1">
        <Stat label="Reservations" value={reservations.length.toString()} hint={statusMix.map((s) => `${s.value} ${s.name.toLowerCase()}`).join(" · ")} />
        <Stat label="Confirmed revenue" value={confirmed.length ? formatMoney(revenue, confirmed[0]!.quote.currency) : "—"} hint={confirmed.length ? `${confirmed.length} paid stays (sum in ${confirmed[0]!.quote.currency})` : "no confirmed stays yet"} tone={confirmed.length ? "ok" : "default"} />
        <Stat label="Ranker NDCG@10" value={`${RANKER_MODEL.metrics["ndcg@10_model"]?.toFixed(3)}`} hint={`vs ${RANKER_MODEL.metrics["ndcg@10_price_asc"]?.toFixed(3)} price-sort · AUC ${RANKER_MODEL.metrics.test_auc?.toFixed(3)}`} />
        <Stat label="Pre-sold inventory" value="35%" hint="deterministic per room type, applied on first touch" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <section className="card p-5 rise rise-d2" aria-labelledby="occ-h">
          <h2 id="occ-h" className="text-base font-semibold font-body">Occupancy by week — sample of 12 hotels per city</h2>
          <p className="text-xs faint mb-3">Average % of units sold per room type over each 7-night window, straight from the segment trees.</p>
          <ChartLegend items={cityLines.map(([k, color]) => ({ color, label: k }))} />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={occupancy} margin={{ left: -14, right: 8, top: 4 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={chartTick} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
              <YAxis unit="%" domain={[0, 100]} tick={chartTick} tickLine={false} axisLine={false} />
              <Tooltip {...chartTooltip} formatter={(v: unknown) => `${v}%`} />
              {cityLines.map(([k, color]) => (
                <Line key={k} type="monotone" dataKey={k} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-5 rise rise-d2" aria-labelledby="lat-h">
          <h2 id="lat-h" className="text-base font-semibold font-body">Search latency — last {latencySeries.length} searches</h2>
          <p className="text-xs faint mb-3">Cache misses run the full pipeline (filter → availability → quote → rank → facets); hits return in microseconds.</p>
          <ChartLegend items={[{ color: C.accent, label: "cache miss (full compute)" }, { color: C.ok, label: "cache hit" }]} />
          {latencySeries.length === 0 ? (
            <div className="h-60 grid place-items-center text-sm faint">Run a few searches, then come back.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={latencySeries} margin={{ left: -14, right: 8, top: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="i" tick={chartTick} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
                <YAxis unit="ms" tick={chartTick} tickLine={false} axisLine={false} />
                <Tooltip {...chartTooltip} formatter={(v: unknown, _n: unknown, item: { payload?: { city: string; cache: string } }) => [`${v} ms · ${item.payload?.city} · ${item.payload?.cache}`, "latency"]} labelFormatter={(l) => `search #${l}`} />
                <Bar dataKey="ms" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {latencySeries.map((s) => <Cell key={s.i} fill={s.cache === "hit" ? C.ok : C.accent} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card p-5 rise rise-d3" aria-labelledby="ltr-h">
          <h2 id="ltr-h" className="text-base font-semibold font-body">Learning-to-rank weights (standardised features)</h2>
          <p className="text-xs faint mb-3">Logistic regression trained on 50k simulated sessions with position bias; negative = lowers the score.</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weights} layout="vertical" margin={{ left: 30, right: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={chartTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="feature" width={92} tick={chartTick} tickLine={false} axisLine={false} />
              <Tooltip {...chartTooltip} formatter={(v: unknown) => [(v as number).toFixed(3), "weight"]} />
              <Bar dataKey="weight" radius={4} isAnimationActive={false}>
                {weights.map((w) => <Cell key={w.feature} fill={w.weight >= 0 ? C.accent : C.coral} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-5 rise rise-d3 grid sm:grid-cols-2 gap-6" aria-label="Catalogue mix">
          <div>
            <h2 className="text-base font-semibold font-body">Star mix</h2>
            <p className="text-xs faint mb-3">{starTotal.toLocaleString()} hotels</p>
            <ul className="grid gap-2.5">
              {starMix.map((s) => (
                <li key={s.name} className="grid grid-cols-[2.2rem_1fr_3.2rem] items-center gap-2 text-sm">
                  <span className="tabular font-medium">{s.name}</span>
                  <span className="h-2.5 rounded-full bg-bg3 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${(s.value / Math.max(1, starTotal)) * 100}%` }} /></span>
                  <span className="tabular text-right faint text-xs">{Math.round((s.value / Math.max(1, starTotal)) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-base font-semibold font-body">Priciest markets</h2>
            <p className="text-xs faint mb-3">Price level relative to the INR base rate.</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCity} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis type="number" tick={chartTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="city" width={82} tick={{ fontSize: 10, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} interval={0} />
                <Tooltip {...chartTooltip} formatter={(v: unknown) => [`${v}× INR base`, "price level"]} />
                <Bar dataKey="level" radius={4} fill={C.a} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="card p-5 mt-4 rise rise-d4" aria-labelledby="res-h">
        <h2 id="res-h" className="text-base font-semibold font-body">Recent reservations</h2>
        {reservations.length === 0 ? (
          <p className="text-sm faint mt-2">No reservations in this session yet — book a room and it appears here with its state transitions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2 tabular">
              <thead className="text-xs uppercase tracking-wider faint text-left"><tr><th scope="col" className="py-2 pr-3">Reservation</th><th scope="col" className="pr-3">Hotel</th><th scope="col" className="pr-3">Stay</th><th scope="col" className="pr-3">Status</th><th scope="col" className="text-right">Total</th></tr></thead>
              <tbody>
                {reservations.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.id}</td>
                    <td className="pr-3">{engine.hotelById.get(r.hotelId)?.name}</td>
                    <td className="pr-3 whitespace-nowrap">{r.checkIn} → {r.checkOut}</td>
                    <td className="pr-3"><span className={`chip ${r.status === "CONFIRMED" ? "chip-ok" : r.status === "HELD" ? "chip-coral" : ""}`}>{r.status}</span></td>
                    <td className="text-right whitespace-nowrap">{formatMoney(r.quote.total, r.quote.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
