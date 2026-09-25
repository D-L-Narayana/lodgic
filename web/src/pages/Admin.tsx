import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isoToDay } from "../../../src/core/calendar.js";
import { RANKER_MODEL } from "../../../src/core/model.js";
import { PageTitle, Stat } from "../components/ui";
import { CITIES, addDays, engine, formatMoney, runSearch, telemetry, today } from "../lib/engine";

const C = { accent: "var(--accent)", coral: "var(--coral)", gold: "var(--gold)", ok: "var(--ok)", ink3: "var(--ink-3)" };

function pct(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

export function Admin() {
  const [, tick] = useState(0);
  useEffect(() => {
    document.title = "Ops dashboard — Lodgic";
    // Warm-up traffic so a cold visit still shows meaningful latency/cache numbers (mix of misses and repeats).
    if (telemetry.searches.length < 8) {
      const cities = ["Goa", "Paris", "Tokyo", "Bengaluru", "London", "Dubai", "Goa", "Paris", "Tokyo", "Goa", "Singapore", "Paris"];
      cities.forEach((city, i) => runSearch({ city, checkIn: addDays(today, 10 + (i % 3)), checkOut: addDays(today, 13 + (i % 3)), guests: 2, pageSize: 20 }));
    }
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
  const revenueInr = confirmed.reduce((s, r) => s + r.quote.total, 0);
  const cache = engine.search.cacheStats();
  const lat = telemetry.searches.map((s) => s.ms);
  const cold = telemetry.searches.filter((s) => s.cache === "miss").map((s) => s.ms);
  const warm = telemetry.searches.filter((s) => s.cache === "hit").map((s) => s.ms);

  const latencySeries = telemetry.searches.slice(-40).map((s, i) => ({ i, ms: Math.round(s.ms * 100) / 100, cache: s.cache }));
  const starMix = [1, 2, 3, 4, 5].map((s) => ({ name: `${s}★`, value: engine.hotels.filter((h) => h.stars === s).length }));
  const byCity = CITIES.map((c) => ({ city: c.name, hotels: engine.hotels.filter((h) => h.city === c.name).length, level: c.priceLevel })).sort((a, b) => b.level - a.level).slice(0, 12);
  const weights = RANKER_MODEL.features.map((f, i) => ({ feature: f.replace(/_/g, " "), weight: RANKER_MODEL.weights[i]! }));
  const statusMix = ["HELD", "CONFIRMED", "CANCELLED", "EXPIRED"].map((s) => ({ name: s, value: reservations.filter((r) => r.status === s).length }));

  return (
    <div className="container-x py-8">
      <PageTitle eyebrow="Ops" title="Engine dashboard">
        <span className="chip">live · refreshes every 2 s · this browser session</span>
      </PageTitle>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rise">
        <Stat label="Catalogue" value={engine.hotels.length.toLocaleString()} hint={`${engine.availability.registered.toLocaleString()} room types · ${CITIES.length} cities`} />
        <Stat label="Availability trees materialised" value={engine.availability.materialised.toLocaleString()} hint={`lazy — ${((engine.availability.materialised / engine.availability.registered) * 100).toFixed(1)}% of room types touched · boot ${telemetry.bootMs} ms`} />
        <Stat label="Search cache hit rate" value={`${(cache.hitRate * 100).toFixed(0)}%`} hint={`${cache.hits} hits · ${cache.misses} misses · ${cache.size} entries`} tone={cache.hitRate > 0.5 ? "ok" : "default"} />
        <Stat label="Search latency p50 / p95" value={lat.length ? `${pct(lat, 50).toFixed(1)} / ${pct(lat, 95).toFixed(1)} ms` : "—"} hint={lat.length ? `${lat.length} searches · cold ${cold.length ? pct(cold, 50).toFixed(1) : "–"} ms · warm ${warm.length ? pct(warm, 50).toFixed(2) : "–"} ms` : "run a search to populate"} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3 rise rise-d1">
        <Stat label="Reservations" value={reservations.length.toString()} hint={statusMix.map((s) => `${s.value} ${s.name.toLowerCase()}`).join(" · ")} />
        <Stat label="Confirmed revenue" value={confirmed.length ? formatMoney(revenueInr, confirmed[0]!.quote.currency) : "—"} hint={confirmed.length ? `${confirmed.length} paid stays (sum in ${confirmed[0]!.quote.currency})` : "no confirmed stays yet"} tone={confirmed.length ? "ok" : "default"} />
        <Stat label="Ranker NDCG@10" value={`${RANKER_MODEL.metrics["ndcg@10_model"]?.toFixed(3)}`} hint={`vs ${RANKER_MODEL.metrics["ndcg@10_price_asc"]?.toFixed(3)} price-sort · AUC ${RANKER_MODEL.metrics.test_auc?.toFixed(3)}`} />
        <Stat label="Pre-sold inventory" value="35%" hint="deterministic per room type, applied on first touch" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <section className="card p-5 rise rise-d2">
          <h2 className="text-base font-semibold font-body">Occupancy by week — sample of 12 hotels per city</h2>
          <p className="text-xs faint mb-3">Average % of units sold per room type over each 7-night window, straight from the segment trees.</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={occupancy} margin={{ left: -20, right: 8 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.ink3 }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: C.ink3 }} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} />
              {[["Goa", C.accent], ["Paris", C.coral], ["Tokyo", C.gold], ["Bengaluru", C.ok]].map(([k, color]) => (
                <Line key={k} type="monotone" dataKey={k} stroke={color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-5 rise rise-d2">
          <h2 className="text-base font-semibold font-body">Search latency — last {latencySeries.length} searches</h2>
          <p className="text-xs faint mb-3">Cache misses run the full pipeline (filter → availability → quote → rank → facets); hits return in microseconds.</p>
          {latencySeries.length === 0 ? (
            <div className="h-60 grid place-items-center text-sm faint">Run a few searches, then come back.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={latencySeries} margin={{ left: -20, right: 8 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: C.ink3 }} />
                <YAxis unit="ms" tick={{ fontSize: 11, fill: C.ink3 }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} />
                <Bar dataKey="ms" radius={[4, 4, 0, 0]}>
                  {latencySeries.map((s) => <Cell key={s.i} fill={s.cache === "hit" ? C.ok : C.accent} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card p-5 rise rise-d3">
          <h2 className="text-base font-semibold font-body">Learning-to-rank weights (standardised features)</h2>
          <p className="text-xs faint mb-3">Logistic regression trained on 40k simulated sessions with position bias; negative = lowers the score.</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weights} layout="vertical" margin={{ left: 30, right: 8 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 11, fill: C.ink3 }} />
              <YAxis type="category" dataKey="feature" width={90} tick={{ fontSize: 11, fill: C.ink3 }} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} />
              <Bar dataKey="weight" radius={4}>
                {weights.map((w) => <Cell key={w.feature} fill={w.weight >= 0 ? C.accent : C.coral} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-5 rise rise-d3 grid sm:grid-cols-2 gap-4">
          <div>
            <h2 className="text-base font-semibold font-body">Star mix</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={starMix} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2} stroke="none">
                  {starMix.map((_, i) => <Cell key={i} fill={[C.ink3, C.gold, C.accent, C.ok, C.coral][i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h2 className="text-base font-semibold font-body">Priciest markets</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={byCity} margin={{ left: -25, right: 4 }}>
                <XAxis dataKey="city" tick={{ fontSize: 9, fill: C.ink3 }} interval={0} angle={-35} height={50} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: C.ink3 }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }} />
                <Area dataKey="level" name="price level ×INR base" stroke={C.accent} fill={C.accent} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="card p-5 mt-4 rise rise-d4">
        <h2 className="text-base font-semibold font-body">Recent reservations</h2>
        {reservations.length === 0 ? (
          <p className="text-sm faint mt-2">No reservations in this session yet — book a room and it appears here with its state transitions.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm mt-2 tabular">
              <thead className="text-xs uppercase tracking-wider faint text-left"><tr><th className="py-2">Reservation</th><th>Hotel</th><th>Stay</th><th>Status</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {reservations.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2">{r.id}</td>
                    <td>{engine.hotelById.get(r.hotelId)?.name}</td>
                    <td>{r.checkIn} → {r.checkOut}</td>
                    <td><span className={`chip ${r.status === "CONFIRMED" ? "chip-ok" : r.status === "HELD" ? "chip-coral" : ""}`}>{r.status}</span></td>
                    <td className="text-right">{formatMoney(r.quote.total, r.quote.currency)}</td>
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
