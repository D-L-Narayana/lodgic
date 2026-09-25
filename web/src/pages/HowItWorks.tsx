import { useTitle } from "../lib/theme";
import { Link } from "react-router-dom";
import { RANKER_MODEL } from "../../../src/core/model.js";
import { PageTitle } from "../components/ui";
import { engine } from "../lib/engine";

const boxes = [
  { id: "web", x: 20, y: 40, w: 150, h: 60, title: "Web app", sub: "React · Vite · TS" },
  { id: "api", x: 20, y: 130, w: 150, h: 60, title: "REST API", sub: "node:http · /api/*" },
  { id: "search", x: 250, y: 40, w: 190, h: 60, title: "SearchService", sub: "filter → quote → rank → facets" },
  { id: "cache", x: 250, y: 130, w: 190, h: 60, title: "LruCache", sub: "TTL · city-scoped invalidation" },
  { id: "avail", x: 520, y: 20, w: 190, h: 60, title: "AvailabilityIndex", sub: "segment tree / room type" },
  { id: "pricing", x: 520, y: 100, w: 190, h: 60, title: "Pricing", sub: "season · weekend · demand · LOS" },
  { id: "rank", x: 520, y: 180, w: 190, h: 60, title: "Ranker", sub: "logistic LTR · explanations" },
  { id: "res", x: 250, y: 230, w: 190, h: 60, title: "ReservationService", sub: "idempotent holds · state machine" },
  { id: "pay", x: 520, y: 260, w: 190, h: 60, title: "PaymentGateway", sub: "intents · confirm · refund" },
];
const links: [string, string][] = [["web", "search"], ["api", "search"], ["search", "cache"], ["search", "avail"], ["search", "pricing"], ["search", "rank"], ["web", "res"], ["api", "res"], ["res", "avail"], ["res", "pay"], ["res", "cache"]];

function Diagram() {
  const by = Object.fromEntries(boxes.map((b) => [b.id, b]));
  return (
    <svg viewBox="0 0 740 340" className="w-full h-auto" role="img" aria-label="Architecture diagram: web app and REST API call SearchService and ReservationService, which use the availability index, pricing, ranker, cache and payment gateway">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-3)" />
        </marker>
      </defs>
      {links.map(([a, b]) => {
        const A = by[a]!;
        const B = by[b]!;
        const x1 = A.x + A.w;
        const y1 = A.y + A.h / 2;
        const x2 = B.x;
        const y2 = B.y + B.h / 2;
        const mx = (x1 + x2) / 2;
        return <path key={`${a}-${b}`} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} stroke="var(--ink-3)" strokeWidth="1.3" fill="none" markerEnd="url(#arrow)" opacity="0.8" />;
      })}
      {boxes.map((b) => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="12" fill="var(--card)" stroke={b.id === "web" || b.id === "api" ? "var(--coral)" : "var(--accent)"} strokeWidth="1.5" />
          <text x={b.x + 14} y={b.y + 26} fontSize="14" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-body)">{b.title}</text>
          <text x={b.x + 14} y={b.y + 45} fontSize="11" fill="var(--ink-2)" fontFamily="var(--font-body)">{b.sub}</text>
        </g>
      ))}
      <text x="20" y="325" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-body)">src/core is pure TypeScript with no Node or DOM dependency — the same bundle runs in the browser and in the serverless API.</text>
    </svg>
  );
}

const steps = [
  { n: "01", title: "Seed & index", body: `${engine.hotels.length.toLocaleString()} hotels and ${engine.availability.registered.toLocaleString()} room types are generated deterministically (mulberry32) so every visitor sees the same catalogue. Each room type gets a segment tree over a 730-night horizon — created lazily on first touch, so boot costs ${engine.hotels.length > 0 ? "~40" : ""} ms and memory only grows with the cities you actually search.` },
  { n: "02", title: "Availability in O(log n)", body: "A stay is a range of nights. `rangeMin(checkIn, checkOut)` tells us the fewest free units on any night; `rangeAdd(-rooms)` books them. Lazy propagation keeps both logarithmic, and `hold()` performs check-and-decrement in one synchronous step, so two guests can never take the same last room." },
  { n: "03", title: "Quote every candidate", body: "Nightly price = base × season × weekend × demand(occupancy) — demand ramps quadratically once a room type passes 50% sold. Stays of 3+ nights earn a discount, taxes are added last, and everything is integer minor units (paise, cents, yen, fils) rounded half-up exactly once per component, so the breakdown always sums to the total." },
  { n: "04", title: "Rank & explain", body: `Eight standardised features (log price, rating, log reviews, distance, stars, popularity, refundability, breakfast) feed a logistic-regression learning-to-rank model trained on 50,000 simulated position-biased sessions (NDCG@10 ${RANKER_MODEL.metrics["ndcg@10_model"]} vs ${RANKER_MODEL.metrics["ndcg@10_price_asc"]} for price-sort). The two largest contributions become the plain-English reasons on every card; traveller profiles re-weight features.` },
  { n: "05", title: "Cache the hot path", body: "Search results are cached in an LRU with a 60 s TTL under a canonical key (city, dates, party, filters, sort, profile). A reservation invalidates only that hotel's city. Under load this turned 1.1k req/s into 9.5k req/s on the REST API." },
  { n: "06", title: "Reserve idempotently", body: "Checkout generates one idempotency key per attempt. `create` holds inventory (HELD, 10-minute timer), `createIntent` charges exactly the quoted amount, `confirm` re-checks the hold and the amount before flipping to CONFIRMED; `cancel` refunds and releases. Replaying any call returns the same result — a retried request never books or charges twice." },
];

export function HowItWorks() {
  useTitle("How it works — Lodgic");
  return (
    <div className="container-x py-8">
      <PageTitle eyebrow="Architecture" title="How Lodgic works">
        <a href="https://github.com/D-L-Narayana/lodgic" className="btn btn-ghost btn-sm" rel="noopener noreferrer" target="_blank">Read the source</a>
      </PageTitle>
      <div className="card p-4 md:p-6 rise overflow-x-auto">
        <div className="min-w-[620px]"><Diagram /></div>
      </div>
      <ol className="grid md:grid-cols-2 gap-4 mt-6">
        {steps.map((s, i) => (
          <li key={s.n} className={`card p-5 rise rise-d${Math.min(i + 1, 4)}`}>
            <span className="font-display text-3xl text-accent-text/70">{s.n}</span>
            <h2 className="text-lg mt-1">{s.title}</h2>
            <p className="text-sm muted mt-2 leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
      <section className="card p-5 mt-6 grid md:grid-cols-3 gap-6 text-sm rise">
        <div>
          <span className="eyebrow">Tested</span>
          <p className="mt-1 muted">26 node:test cases — randomised segment-tree vs brute force, money rounding across JPY/KWD/INR, k-way merge stability, a 500-request race for the last unit that must produce exactly one 201.</p>
        </div>
        <div>
          <span className="eyebrow">Measured</span>
          <p className="mt-1 muted">Cache-warm search 9.5k req/s at p50 4 ms; cold path 1.1k req/s; engine search 0.7 ms uncached; hold+release 1.46M ops/s. See the Ops dashboard for your own session's numbers.</p>
        </div>
        <div>
          <span className="eyebrow">Two hosts, one engine</span>
          <p className="mt-1 muted">This page is running the engine in your tab. The same code answers <code>/api/search</code> as a serverless function. <Link to="/admin" className="link">Open the dashboard →</Link></p>
        </div>
      </section>
    </div>
  );
}
