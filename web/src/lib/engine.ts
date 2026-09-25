/**
 * Front-end access to the engine. Default: the real engine runs in-browser (same code as the
 * REST API). If VITE_API_URL is set (or ?api=1), searches go to the serverless API instead.
 */
import { Engine, hashString } from "../../../src/core/engine.js";
import { formatMoney } from "../../../src/core/money.js";
import type { Hotel, Reservation, SearchHit, SearchQuery } from "../../../src/core/types.js";
import { CITIES } from "../../../src/core/seed.js";

export type { Hotel, Reservation, SearchHit, SearchQuery };
export { formatMoney, CITIES };

export const today = new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const nightsBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

/** Telemetry for the ops dashboard — recorded per search, kept in memory for the session. */
export interface SearchSample {
  at: number;
  ms: number;
  cache: "hit" | "miss";
  city: string;
  total: number;
}
export const telemetry: { searches: SearchSample[]; bootMs: number } = { searches: [], bootMs: 0 };

const t0 = performance.now();
export const engine = new Engine({
  today,
  preloadOccupancy: 0.35,
  search: { cacheCapacity: 3_000, cacheTtlMs: 60_000 },
  onReservationChange: () => persistBookings(),
});
telemetry.bootMs = Math.round(performance.now() - t0);

export function runSearch(q: SearchQuery) {
  const t = performance.now();
  const res = engine.search.search(q);
  const ms = performance.now() - t;
  telemetry.searches.push({ at: Date.now(), ms, cache: res.cache, city: q.city, total: res.total });
  if (telemetry.searches.length > 500) telemetry.searches.shift();
  return { ...res, tookMs: ms };
}

/* ---------- Photos: deterministic Unsplash picks per hotel (verified public photo ids) ---------- */
const PHOTO_IDS = [
  // curated hotel exteriors, rooms and pools (verified visually)
  "1566073771259-6a8506099945", "1520250497591-112f2f40a3f4", "1551882547-ff40c63fe5fa", "1542314831-068cd1dbfeeb", "1571003123894-1f0594d2b5d9",
  "1445019980597-93fa8acb246c", "1582719508461-905c673771fd", "1584132967334-10e028bd69f7", "1590490360182-c33d57733427", "1611892440504-42a792e24d32",
  "1618773928121-c32242e63f39", "1631049307264-da0ec9d70304", "1578683010236-d716f9a3f461", "1512918728675-ed5a9ecdebfd", "1505693416388-ac5ce068fe85",
  "1540541338287-41700207dee6", "1517840901100-8179e982acb7", "1564501049412-61c2a3083791", "1560448204-e02f11c3d0e2", "1502672260266-1c1ef2d93688",
  "1455587734955-081b22074882", "1522798514-97ceb8c4f1c8", "1549294413-26f195200c16", "1595576508898-0ad5c879a061", "1600011689032-8b628b8a8747",
  "1507089947368-19c1da9775ae", "1568495248636-6432b97bd949", "1615460549969-36fa19521a4f", "1519449556851-5720b33024e7", "1615880484746-a134be9a6ecf",
  "1561501900-3701fa6a0864", "1499793983690-e29da59ef1c2",
];
const DESTINATION_IDS = ["1476514525535-07fb3b4ae5f1", "1506905925346-21bda4d32df4", "1520250497591-112f2f40a3f4", "1540541338287-41700207dee6", "1519449556851-5720b33024e7", "1600011689032-8b628b8a8747", "1584132967334-10e028bd69f7", "1499793983690-e29da59ef1c2", "1549294413-26f195200c16", "1542314831-068cd1dbfeeb"];
export function hotelPhotos(hotelId: string, count = 5, w = 900): string[] {
  const start = hashString(hotelId) % PHOTO_IDS.length;
  return Array.from({ length: count }, (_, i) => `https://images.unsplash.com/photo-${PHOTO_IDS[(start + i * 11) % PHOTO_IDS.length]}?auto=format&fit=crop&w=${w}&q=70`);
}
export const cityPhoto = (city: string, w = 800): string => `https://images.unsplash.com/photo-${DESTINATION_IDS[hashString(city) % DESTINATION_IDS.length]}?auto=format&fit=crop&w=${w}&q=70`;

/* ---------- Bookings persistence (localStorage) ---------- */
const KEY = "lodgic-bookings-v1";
export interface StoredBooking {
  reservation: Reservation;
  hotelName: string;
  city: string;
  roomName: string;
  photo: string;
}
export function loadBookings(): StoredBooking[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as StoredBooking[];
  } catch {
    return [];
  }
}
function persistBookings(): void {
  // Reservations live in the engine (this session); mirror the ones we know about into storage.
  const known = loadBookings();
  const byId = new Map(known.map((b) => [b.reservation.id, b]));
  for (const r of engine.reservations.list()) {
    const prev = byId.get(r.id);
    if (prev) prev.reservation = { ...r };
  }
  localStorage.setItem(KEY, JSON.stringify([...byId.values()]));
}
export function rememberBooking(b: StoredBooking): void {
  const list = loadBookings().filter((x) => x.reservation.id !== b.reservation.id);
  list.unshift(b);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
}
export function updateStoredBooking(r: Reservation): void {
  const list = loadBookings();
  const idx = list.findIndex((x) => x.reservation.id === r.id);
  if (idx >= 0) {
    list[idx]!.reservation = { ...r };
    localStorage.setItem(KEY, JSON.stringify(list));
  }
}

/* ---------- misc ---------- */
export const AMENITY_LABEL: Record<string, string> = {
  wifi: "Free Wi-Fi", breakfast: "Breakfast", pool: "Pool", gym: "Gym", parking: "Parking", spa: "Spa", airport_shuttle: "Airport shuttle", pet_friendly: "Pet friendly", restaurant: "Restaurant", bar: "Bar",
};
export const SORT_LABEL: Record<string, string> = { recommended: "Recommended", price_asc: "Price: low to high", price_desc: "Price: high to low", rating_desc: "Guest rating", distance_asc: "Distance to centre" };

export function parseSearchParams(sp: URLSearchParams): SearchQuery {
  const num = (k: string, d: number): number => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  const amen = sp.getAll("amenity");
  return {
    city: sp.get("city") ?? "Goa",
    checkIn: sp.get("checkIn") ?? addDays(today, 14),
    checkOut: sp.get("checkOut") ?? addDays(today, 17),
    guests: num("guests", 2),
    rooms: num("rooms", 1),
    sort: (sp.get("sort") as SearchQuery["sort"]) ?? "recommended",
    pageSize: 50,
    ...(sp.get("currency") ? { currency: sp.get("currency") as SearchQuery["currency"] } : {}),
    ...(sp.get("minStars") ? { minStars: num("minStars", 1) } : {}),
    ...(sp.get("maxNightlyPrice") ? { maxNightlyPrice: num("maxNightlyPrice", 0) } : {}),
    ...(amen.length ? { amenities: amen as SearchQuery["amenities"] } : {}),
    ...(sp.get("freeCancellation") === "1" ? { freeCancellation: true } : {}),
    ...(sp.get("traveller") ? { traveller: sp.get("traveller") as SearchQuery["traveller"] } : {}),
  };
}
export function toSearchParams(q: Partial<SearchQuery>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === "" || k === "pageSize" || k === "page") continue;
    if (k === "amenities") (v as string[]).forEach((a) => sp.append("amenity", a));
    else if (k === "freeCancellation") sp.set(k, v ? "1" : "0");
    else sp.set(k, String(v));
  }
  return sp;
}
