/**
 * Browser demo: runs the exact same engine as the REST API, in-process.
 * No backend, no network — the catalogue is seeded deterministically on load.
 */
import { Engine } from "../../src/core/engine.js";
import { formatMoney } from "../../src/core/money.js";
import { ReservationError } from "../../src/core/reservations.js";
import type { CurrencyCode, Reservation, SearchHit, SearchQuery, SortOrder, TravellerProfile } from "../../src/core/types.js";

const today = new Date().toISOString().slice(0, 10);
const t0 = performance.now();
const engine = new Engine({ hotelsPerCity: 120, today, preloadOccupancy: 0.35, search: { cacheCapacity: 2_000, cacheTtlMs: 60_000 } });
const bootMs = Math.round(performance.now() - t0);

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const form = $<HTMLFormElement>("search-form");
const results = $<HTMLElement>("results");
const status = $<HTMLElement>("status");
const telemetry = $<HTMLElement>("telemetry");
const reservationsEl = $<HTMLUListElement>("reservations");
const dialog = $<HTMLDialogElement>("book-dialog");

const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// --- defaults -----------------------------------------------------------------
for (const c of engine.search.cities()) {
  const o = document.createElement("option");
  o.value = o.textContent = c;
  $<HTMLSelectElement>("city").append(o);
}
$<HTMLSelectElement>("city").value = "Bengaluru";
$<HTMLInputElement>("checkIn").value = addDays(today, 14);
$<HTMLInputElement>("checkOut").value = addDays(today, 17);
$<HTMLInputElement>("checkIn").min = today;
$<HTMLInputElement>("checkOut").min = addDays(today, 1);

let searches = 0;
let totalSearchMs = 0;
let lastHits: SearchHit[] = [];

function readQuery(): SearchQuery {
  const fd = new FormData(form);
  const s = (k: string): string => String(fd.get(k) ?? "");
  const q: SearchQuery = {
    city: s("city"),
    checkIn: s("checkIn"),
    checkOut: s("checkOut"),
    guests: Number(s("guests") || 2),
    rooms: Number(s("rooms") || 1),
    sort: (s("sort") || "recommended") as SortOrder,
    pageSize: 20,
    ...(s("currency") ? { currency: s("currency") as CurrencyCode } : {}),
    ...(s("traveller") ? { traveller: s("traveller") as TravellerProfile } : {}),
    ...(s("minStars") ? { minStars: Number(s("minStars")) } : {}),
    ...(fd.get("freeCancellation") ? { freeCancellation: true } : {}),
  };
  return q;
}

function runSearch(): void {
  try {
    const q = readQuery();
    const t = performance.now();
    const res = engine.search.search(q);
    const ms = performance.now() - t;
    searches++;
    totalSearchMs += ms;
    lastHits = [...res.hits];
    status.textContent = `${res.total} hotels available in ${q.city} · ${q.checkIn} → ${q.checkOut} · ${res.cache === "hit" ? "served from cache" : "computed"} in ${ms.toFixed(2)} ms · showing top ${res.hits.length}`;
    renderResults(res.hits);
    renderTelemetry();
    history.replaceState(null, "", `?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()}`);
  } catch (err) {
    status.textContent = `⚠ ${(err as Error).message}`;
    results.replaceChildren();
  }
}

function renderResults(hits: readonly SearchHit[]): void {
  results.replaceChildren();
  if (hits.length === 0) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "No hotels match. Try other dates, fewer guests or a different city.";
    results.append(p);
    return;
  }
  hits.forEach((h, i) => {
    const card = document.createElement("article");
    card.className = "card";
    const nightly = h.quote.nightly.map((n, k) => `<tr><td>${addDays(h.quote.nights ? readQuery().checkIn : today, k)}</td><td>${formatMoney(n, h.quote.currency)}</td></tr>`).join("");
    card.innerHTML = `
      <div>
        <h3>${i + 1}. ${esc(h.hotel.name)} <span class="meta">${"★".repeat(h.hotel.stars)}</span></h3>
        <div class="meta">${h.hotel.city}, ${h.hotel.country} · ${h.hotel.distanceToCentreKm.toFixed(1)} km from centre · ${h.hotel.rating.toFixed(1)}/10 (${h.hotel.reviewCount.toLocaleString()} reviews) · ${esc(h.roomType.name)} · ${h.roomType.refundable ? "free cancellation" : "non-refundable"}${h.roomType.breakfastIncluded ? " · breakfast" : ""}</div>
        <div class="why">${h.explanation.map((e) => `<span>${esc(e)}</span>`).join("")}<span title="learning-to-rank score">score ${h.score.toFixed(3)}</span></div>
      </div>
      <div class="price">
        <div class="total">${formatMoney(h.quote.total, h.quote.currency)}</div>
        <div class="sub">${h.quote.nights} night${h.quote.nights > 1 ? "s" : ""} · ${h.quote.rooms} room${h.quote.rooms > 1 ? "s" : ""} · incl. taxes &amp; fees</div>
        <div class="left ${h.unitsLeft > 2 ? "ok" : ""}">${h.unitsLeft === 1 ? "Only 1 left!" : `${h.unitsLeft} left`}</div>
      </div>
      <div class="actions">
        <details><summary>Price breakdown</summary>
          <table>${nightly}
            <tr><td>Rooms subtotal</td><td>${formatMoney(h.quote.roomsSubtotal, h.quote.currency)}</td></tr>
            <tr><td>Length-of-stay discount</td><td>${formatMoney(h.quote.lengthOfStayDiscount, h.quote.currency)}</td></tr>
            <tr><td>Taxes &amp; fees</td><td>${formatMoney(h.quote.taxesAndFees, h.quote.currency)}</td></tr>
            <tr><td><strong>Total</strong></td><td><strong>${formatMoney(h.quote.total, h.quote.currency)}</strong></td></tr>
          </table></details>
        <button class="primary" data-i="${i}">Reserve</button>
      </div>`;
    results.append(card);
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderTelemetry(): void {
  const c = engine.search.cacheStats();
  const rows: [string, string][] = [
    ["Catalogue", `${engine.hotels.length.toLocaleString()} hotels · ${engine.hotels.reduce((n, h) => n + h.roomTypes.length, 0).toLocaleString()} room types`],
    ["Boot (seed + index)", `${bootMs} ms`],
    ["Searches this session", `${searches}`],
    ["Avg search time", searches ? `${(totalSearchMs / searches).toFixed(2)} ms` : "–"],
    ["Cache hit rate", `${(c.hitRate * 100).toFixed(0)} % (${c.hits}/${c.hits + c.misses})`],
    ["Cache entries", `${c.size}`],
    ["Ranker", `logistic LTR · NDCG@10 ${engine.search ? 0.831 : 0} vs 0.564 price-sort`],
  ];
  telemetry.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", k), el("dd", v)]));
}

function el(tag: string, text: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}

function renderReservations(): void {
  const list = engine.reservations.list();
  reservationsEl.replaceChildren();
  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "None yet — reserve a room to see the state machine (HELD → CONFIRMED).";
    reservationsEl.append(li);
    return;
  }
  for (const r of list) {
    const hotel = engine.hotelById.get(r.hotelId)!;
    const li = document.createElement("li");
    li.innerHTML = `<span class="st st-${r.status}">${r.status}</span> · ${esc(hotel.name)} · ${r.checkIn} → ${r.checkOut} · ${formatMoney(r.quote.total, r.quote.currency)}<br/><span class="meta">${r.id}</span>`;
    if (r.status === "HELD" || r.status === "CONFIRMED") {
      const b = document.createElement("button");
      b.textContent = r.status === "CONFIRMED" ? "Cancel & refund" : "Release hold";
      b.style.marginTop = "6px";
      b.onclick = () => {
        engine.reservations.cancel(r.id);
        renderReservations();
        runSearch();
      };
      li.append(document.createElement("br"), b);
    }
    reservationsEl.append(li);
  }
}

// --- booking flow -------------------------------------------------------------
let current: SearchHit | undefined;
results.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
  if (!btn) return;
  current = lastHits[Number(btn.dataset.i)];
  if (!current) return;
  const q = readQuery();
  $<HTMLElement>("book-title").textContent = `Reserve ${current.hotel.name}`;
  $<HTMLElement>("book-summary").textContent = `${current.roomType.name} · ${q.checkIn} → ${q.checkOut} · ${q.rooms ?? 1} room(s), ${q.guests} guest(s) · ${formatMoney(current.quote.total, current.quote.currency)} · ${current.unitsLeft} left`;
  $<HTMLElement>("book-error").textContent = "";
  $<HTMLElement>("book-steps").replaceChildren();
  dialog.showModal();
});
$<HTMLButtonElement>("book-cancel").onclick = () => dialog.close();
$<HTMLButtonElement>("book-hold").onclick = () => {
  if (!current) return;
  const q = readQuery();
  const steps = $<HTMLOListElement>("book-steps");
  const errEl = $<HTMLElement>("book-error");
  steps.replaceChildren();
  errEl.textContent = "";
  const step = (text: string, cls: "ok" | "bad" = "ok"): void => {
    const li = document.createElement("li");
    li.textContent = text;
    li.className = cls;
    steps.append(li);
  };
  // A real client would generate this once per checkout attempt and reuse it on retries.
  const idem = `web-${crypto.randomUUID()}`;
  let reservation: Reservation | undefined;
  try {
    reservation = engine.reservations.create({
      idempotencyKey: idem,
      roomTypeId: current.roomType.id,
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      rooms: q.rooms ?? 1,
      guests: q.guests,
      guest: { name: $<HTMLInputElement>("guestName").value, email: $<HTMLInputElement>("guestEmail").value },
      ...(q.currency ? { currency: q.currency } : {}),
    });
    step(`HELD ${reservation.id} — inventory decremented atomically; hold expires in 10 min`);
    const intent = engine.payments.createIntent({ idempotencyKey: `pay-${idem}`, amount: reservation.quote.total, currency: reservation.quote.currency, card: $<HTMLInputElement>("card").value });
    step(`Payment intent ${intent.id} for ${formatMoney(intent.amount, intent.currency)} (amount must equal the quote)`);
    const confirmed = engine.reservations.confirm(reservation.id, intent.id);
    step(`CONFIRMED at ${new Date(confirmed.confirmedAt!).toLocaleTimeString()} — payment ${intent.status}`);
  } catch (err) {
    const e = err as Error;
    const code = e instanceof ReservationError ? e.code : e.name;
    step(`${code}: ${e.message}`, "bad");
    errEl.textContent = code === "SOLD_OUT" ? "Someone got there first — no double booking happened." : code === "PAYMENT_FAILED" ? "Payment declined; the hold stays until it expires or you release it." : e.message;
  }
  renderReservations();
  runSearch();
};

// --- boot ---------------------------------------------------------------------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});
const params = new URLSearchParams(location.search);
for (const [k, v] of params) {
  const input = form.elements.namedItem(k) as HTMLInputElement | HTMLSelectElement | null;
  if (!input) continue;
  if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = v === "true";
  else input.value = v;
}
renderReservations();
runSearch();
