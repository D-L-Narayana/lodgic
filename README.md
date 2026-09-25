# Lodgic — hotel search & reservation engine, with the product on top

[![CI](https://github.com/D-L-Narayana/lodgic/actions/workflows/ci.yml/badge.svg)](https://github.com/D-L-Narayana/lodgic/actions/workflows/ci.yml)
[![Live](https://img.shields.io/badge/live-lodgic--jade.vercel.app-0f5e6b)](https://lodgic-jade.vercel.app)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![engine deps](https://img.shields.io/badge/engine%20runtime%20deps-0-brightgreen)
![tests](https://img.shields.io/badge/tests-26%20passing-blue)
[![MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)

**[lodgic-jade.vercel.app](https://lodgic-jade.vercel.app)** — search **4,000 hotels in 40 cities** with live availability, demand-based
nightly prices and a learning-to-rank model that explains itself; hold, pay (mock) and manage bookings; watch the engine in an ops dashboard.

The engine (`src/core`) is pure TypeScript with **zero runtime dependencies**: a segment-tree availability index, integer-minor-unit pricing,
k-way supplier-feed merge, LRU/TTL cache, idempotent double-booking-safe reservations and a mock PSP. The same bundle powers the REST API
(Node `http` locally, a **Vercel serverless function** at `/api/*` in production) *and* runs inside the React web app, so every page works
offline-first with no backend round-trip.

<p align="center">
  <img src="docs/screenshots/home-dark-desktop.jpg" width="49%" alt="Landing page, dark theme" />
  <img src="docs/screenshots/results-desktop.jpg" width="49%" alt="Results with filters, ranking explanations and live prices" />
</p>
<p align="center">
  <img src="docs/screenshots/hotel-desktop.jpg" width="49%" alt="Hotel page with gallery, room types and live price breakdown" />
  <img src="docs/screenshots/admin-desktop.jpg" width="49%" alt="Ops dashboard: occupancy, latency, cache hit rate, ranker weights" />
</p>
<p align="center">
  <img src="docs/screenshots/map-desktop.jpg" width="32%" alt="Map view with price pins" />
  <img src="docs/screenshots/checkout-desktop.jpg" width="32%" alt="Checkout with mock payment" />
  <img src="docs/screenshots/how-desktop.jpg" width="32%" alt="How it works: architecture diagram" />
</p>
<p align="center">
  <img src="docs/screenshots/home-mobile.jpg" width="19%" alt="Mobile landing" />
  <img src="docs/screenshots/results-mobile.jpg" width="19%" alt="Mobile results" />
  <img src="docs/screenshots/hotel-mobile.jpg" width="19%" alt="Mobile hotel page" />
  <img src="docs/screenshots/admin-mobile.jpg" width="19%" alt="Mobile ops dashboard" />
</p>

## The product

| Page | What you can do |
| --- | --- |
| **Landing** `/` | Hero search with destination autocomplete (40 cities), two-month date-range picker, guests/rooms stepper; featured destinations |
| **Results** `/search` | Filters (max nightly price, stars, 10 amenities, free cancellation, display currency), 5 sort orders, traveller-profile personalisation, **list ⇄ map** toggle (Leaflet/OpenStreetMap price pins), skeleton loaders, empty & error states, ranking explanations on every card |
| **Hotel** `/hotel/:id` | Photo gallery, room types with occupancy-for-your-dates, **live price breakdown** per night (weekend/season/demand, LOS discount, taxes) |
| **Checkout** `/checkout/…` | Guest + mock card form (Luhn-validated; `4242…` succeeds, `4000 0000 0000 0002` declines), step-by-step hold → intent → confirm with one idempotency key per attempt |
| **Confirmation** & **My bookings** | Confirmation with `.ics` calendar export; bookings list with status chips, cancel & refund / release hold |
| **Ops** `/admin` | Occupancy by week from the segment trees, search latency p50/p95, cache hit rate, materialised-tree counter, LTR weights, star mix, reservations table — live for your session |
| **How it works** `/how-it-works` | Architecture diagram and the six ideas behind the engine |

Design: warm sand surfaces with a deep-lagoon accent, Fraunces display + Satoshi body, light/dark themes (`prefers-color-scheme` + toggle),
fluid type, 4-px spacing, reduced-motion aware micro-animations, keyboard-navigable combobox/dialogs with ARIA roles, responsive from 360 px up.

## What it does

| Area | Implementation | Where |
| --- | --- | --- |
| **Availability** | One segment tree per room type over a 730-night horizon: `rangeMin` + lazy `rangeAdd` in O(log n). `hold()` is all-or-nothing, so overlapping requests can never both take the last unit | `src/core/availability.ts` |
| **Pricing** | Nightly rate = base × season × weekend × demand(occupancy) with a quadratic demand curve, length-of-stay discounts, taxes; **integer minor-unit arithmetic** (ISO 4217 exponents: JPY 0, KWD 3), half-up rounding in exactly one place, largest-remainder allocation so invoice lines always sum to the charged total | `src/core/pricing.ts`, `src/core/money.ts` |
| **Search & ranking** | Filter (city, dates, guests/rooms, stars, amenities, refundability, price cap) → quote → **logistic-regression learning-to-rank** score with per-hit explanations ("great price for the area") → sort → paginate → facets. Rule-based personalisation (budget/business/family) on top of learned weights | `src/core/search.ts`, `src/core/ranking.ts`, `ml/train_ranker.py` |
| **Reservations** | `HELD → CONFIRMED → CANCELLED / EXPIRED` state machine, 10-minute holds with a sweeper, **idempotency keys** (a retried request never books twice), payment amount must equal the quote, cancel refunds and releases inventory | `src/core/reservations.ts` |
| **Payments** | Mock PSP with intent → confirm → refund, idempotent create, Luhn validation, Stripe-style test cards for failure injection | `src/core/payments.ts` |
| **Caching** | LRU + TTL over `Map` insertion order (O(1) get/set/evict), canonical cache keys, hit/miss/eviction stats, city-scoped invalidation whenever a reservation changes | `src/core/cache.ts` |
| **Supplier feeds** | k-way merge of sorted price feeds with a binary heap (O(N log k)); de-duplication of the same property across suppliers (normalised name + haversine radius), keeping the cheapest offer; supplier stop-sell calendar parsing with interval merging | `src/core/feeds.ts`, `src/core/calendar.ts` |
| **REST API** | `node:http` + 60-line router: request ids, JSON errors with codes, input validation, CORS, `/metrics` with p50/p95/p99, JSONL audit log of reservation changes | `src/server/` |
| **Web app** | React 19 + Vite + Tailwind v4 + react-router; imports the engine directly (in-browser) and can talk to `/api` | `web/` |
| **Serverless API** | `src/server/vercel.ts` bundled by esbuild to `api/index.js`, deployed with the static build; `vercel.json` rewrites `/api/*` and SPA routes | `src/server/vercel.ts` |

## Run it

```bash
git clone https://github.com/D-L-Narayana/lodgic.git && cd lodgic
npm ci                 # dev dependencies only: typescript, vite, autocannon, @types/node
npm test               # tsc + node:test — 26 tests incl. a 500-way concurrent double-booking race
npm start              # REST API on http://localhost:8080 (4,000 seeded hotels, 12,079 room types)
npm run web:dev        # web app on http://localhost:5173 (in-browser engine)
npm run deploy:build   # web/dist = static app + api/index.js serverless function + vercel.json  → `vercel deploy --prebuilt`-style upload
npm run bench:engine   # micro-benchmarks
npm run bench:load     # autocannon load test against a running server
python3 ml/train_ranker.py   # retrain the ranker (numpy only) -> src/core/model.ts
```

Environment for `npm start`: `PORT` (8080), `HOTELS_PER_CITY` (100), `PRELOAD_OCCUPANCY` (0.35), `SEARCH_CACHE_TTL_MS` (30000), `TODAY`, `LOG_REQUESTS=1`.

### API

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/search?city=Goa&checkIn=2026-03-01&checkOut=2026-03-04&guests=2` | `rooms`, `currency`, `minStars`, `maxNightlyPrice`, `amenity` (repeatable), `freeCancellation`, `sort` (`recommended` \| `price_asc` \| `price_desc` \| `rating_desc` \| `distance_asc`), `traveller` (`budget` \| `business` \| `family` \| `leisure`), `page`, `pageSize` |
| GET | `/hotels/:id` | Full hotel record with room types |
| POST | `/reservations` | Header `Idempotency-Key`; body `{roomTypeId, checkIn, checkOut, guests, rooms?, guest:{name,email}, currency?}` → `201 HELD` or `409 SOLD_OUT` |
| POST | `/payments/intents` | Header `Idempotency-Key`; body `{amount, currency, card}` (test cards: `4242…4242` ok, `4000…0002` declined) |
| POST | `/reservations/:id/confirm` | body `{paymentIntentId}` → `CONFIRMED`, or `402 PAYMENT_FAILED` / `400 AMOUNT_MISMATCH` |
| POST | `/reservations/:id/cancel` | Releases inventory, refunds if it was charged |
| GET | `/reservations`, `/reservations/:id`, `/cities`, `/health`, `/metrics` | |

```bash
curl -s 'localhost:8080/search?city=Bengaluru&checkIn=2026-03-10&checkOut=2026-03-13&guests=2&currency=USD&pageSize=2' | jq '.hits[0] | {name, score, explanation, total: .quote.total, unitsLeft}'
curl -s -X POST localhost:8080/reservations -H 'Idempotency-Key: demo-1' -H 'Content-Type: application/json' \
  -d '{"roomTypeId":"h_bengaluru_20_r1","checkIn":"2026-03-10","checkOut":"2026-03-13","guests":2,"guest":{"name":"Asha","email":"asha@example.com"}}'
```

## Architecture

```
                 ┌────────────────────────── src/core (pure TypeScript, no I/O) ──────────────────────────┐
 web/ (browser)  │  seed ─► Hotel[] ─► AvailabilityIndex (segment tree per room type)                    │
 src/server/     │                       │                                                                │
 (node:http) ───►│  SearchService: filter → unitsLeft/occupancy → quote (pricing, money) → LTR score      │
                 │        └── LruCache<query, hits>  ◄── invalidateCity() on every reservation change     │
                 │  ReservationService: idempotency map → hold() → HELD ─confirm(PaymentGateway)─► CONFIRMED│
                 │  feeds: MinHeap k-way merge · dedupeOffers · calendar: mergeRanges / parse calendars    │
                 └──────────────────────────────────────────────────────────────────────────────────────────┘
```

Design decisions worth reading in the code:

- **Correctness over cleverness for money.** Amounts are integers of minor units everywhere; FX and tax rounding happen once per component, and `allocate()` distributes a total across nights by largest remainder, so an invoice always adds up (`test/core.test.ts › money`).
- **No double booking, by construction.** A hold checks `rangeMin` over the stay and decrements every night in the same synchronous step. The HTTP test fires **500 concurrent reservations at the last unit and asserts exactly one `201`** and 499 `409 SOLD_OUT`. In a multi-node deployment the same guarantee would move to the database (`SELECT … FOR UPDATE` / a per-night unique constraint) — the service boundary is designed so that swap is local to `AvailabilityIndex`.
- **Idempotency everywhere a client can retry.** Reservations, payment intents and confirms are all safe to replay; the key is the client's, not the server's.
- **Cache invalidation is scoped, not global.** A booking invalidates only searches for that hotel's city; everything else keeps its 30 s TTL.
- **Explainable ranking.** Every hit carries the two largest model contributions in plain English so a product manager can see *why* a hotel ranks where it does.
- **One engine, three hosts.** `src/core` has no Node or DOM dependency, so the same code runs in the Node API, in the Vercel function and in the browser.
- **Lazy availability trees.** 12,079 room types are registered at boot, but a segment tree is only materialised the first time a search or booking touches it (with deterministic pre-sold inventory applied at that moment). Boot is ~40 ms and memory grows with the cities you actually use — the Ops page shows the counter.

## Learning-to-rank model

`ml/train_ranker.py` (numpy only) simulates 50,000 search sessions × 20 candidates ranked by a price-ascending production
ranker with **position bias** (examination probability ∝ 1/√rank), draws bookings from a hidden utility, fits an L2-regularised
logistic regression on 8 standardised features, and evaluates on 10,000 held-out sessions with the hidden utility as graded
relevance. The exported weights live in `src/core/model.ts`.

| Ranker | NDCG@10 (10k held-out sessions) |
| --- | ---: |
| **Logistic-regression LTR (this)** | **0.831** |
| Guest rating, descending | 0.667 |
| Price, ascending (the logged production ranker) | 0.564 |
| Random | 0.474 |

Test AUC 0.741, log-loss 0.270, booking rate 9.0 %. Learned weights (standardised features): price −0.92, rating +0.58,
distance −0.43, reviews +0.18, free cancellation +0.13, popularity +0.12, breakfast +0.11, stars −0.15 (the negative
sign on stars is *conditional on price*: at the same price, more stars means an older/less-central property in the simulator).
The data is synthetic, so the lift (+47 % over price-sort) demonstrates the pipeline, not real-world performance.

## Benchmarks

Measured on the 2-vCPU sandbox that runs CI, Node v20.20 — treat as relative numbers. Reproduce with
`npm run bench:engine` and `npm run bench:load`; raw output in [`bench/engine-results.json`](bench/engine-results.json) and
[`bench/load-results.json`](bench/load-results.json).

**Engine (single thread; measured on the earlier 1,440-hotel / 4,339-room-type catalogue — per-city work is unchanged at 100–120 hotels)**

| Operation | Throughput | Avg |
| --- | ---: | ---: |
| Search, cache disabled — filter + availability + quote + rank + facets over 120 hotels | 1,385 /s | 0.72 ms |
| Search, cache warm | 48,957 /s | 20 µs |
| Availability `rangeMin`, 1–30 nights: segment tree | 4.5 M /s | 0.22 µs |
| Availability `rangeMin`, 1–30 nights: linear scan | 49.3 M /s | 0.02 µs |
| Availability `rangeMin`, 365 nights (occupancy report): segment tree | 4.75 M /s | 0.21 µs |
| Availability `rangeMin`, 365 nights: linear scan | 3.04 M /s | 0.33 µs |
| `hold` + `release`, 3 nights | 1.46 M /s | 0.68 µs |
| Reservation create (validate + quote + hold) | 51,643 /s | 19 µs |

Honest finding: for typical 1–30-night stays the linear scan beats the segment tree by an order of magnitude — the constant
factor wins at n ≤ 30. The tree pays off for long ranges and for `rangeAdd` (holds/stop-sells) over many nights, and keeps
every operation O(log n) regardless of horizon length, which is why it stays; the benchmark is there so the trade-off is measured, not assumed.

**HTTP (autocannon, 50 connections × 10 s, client and server on the same box)**

| Scenario | req/s | p50 | p99 | errors |
| --- | ---: | ---: | ---: | ---: |
| `GET /search`, 48 popular queries (cache warm) | 9,472 | 4 ms | 15 ms | 0 |
| `GET /search`, random queries, cache disabled (full compute) | 1,136 | 41 ms | 94 ms | 0 |
| `GET /health` | 27,026 | 1 ms | 4 ms | 0 |

The cache lifts search throughput **8.3×** and cuts p50 latency **10×**. The uncached handler itself takes ~0.9 ms p50 server-side; the remaining cold-path latency is queueing on a single thread (the obvious next step is `node:cluster`).

## Tests

`npm test` runs 26 tests with the built-in `node:test` runner (~1.2 s): money rounding across JPY/KWD/INR, randomised
segment-tree vs brute-force equivalence (5,000 ops), atomic holds and stop-sell, deterministic pricing rules, heap and k-way
merge stability, supplier de-duplication, LRU eviction + TTL, ranking monotonicity, payment idempotency and failure injection,
reservation lifecycle (hold → confirm → cancel → refund, expiry sweeper, amount mismatch, declined card), HTTP validation,
an end-to-end booking over HTTP, and the 500-request double-booking race.

## Project layout

```
src/core/      engine (types, money, calendar, availability, pricing, feeds, cache, ranking, model, seed, search, payments, reservations, engine)
src/server/    app.ts (router + handlers + metrics), main.ts (entry point, JSONL audit log, hold sweeper)
web/           React app: src/pages (Landing, Results, Hotel, Checkout, Bookings/Confirmation, Admin, HowItWorks), src/components (SearchBar, MapView, ui), src/lib/engine.ts
docs/          screenshots used in this README
test/          node:test suites (core.test.ts, engine.test.ts)
bench/         engine.ts micro-benchmarks, load.mjs autocannon runner, results
ml/            train_ranker.py, metrics.json
```

## Roadmap

- Persist availability + reservations in PostgreSQL (per-night unique constraint) so the serverless API keeps state across instances; run the Node API under `node:cluster`
- Replace the mock PSP with a real sandbox integration and webhooks
- Pairwise/listwise LTR (LambdaMART) with inverse-propensity weighting for the position bias
- Multi-supplier ingestion pipeline using the feed merge/dedupe primitives

## License

MIT © D L Narayana
