import { AvailabilityIndex } from "./availability.js";
import { HORIZON_DAYS, isoToDay } from "./calendar.js";
import { MockPaymentGateway, type PaymentGateway } from "./payments.js";
import { ReservationService, type ReservationServiceOptions } from "./reservations.js";
import { SearchService, type SearchServiceOptions } from "./search.js";
import { seedHotels, type SeedOptions } from "./seed.js";
import type { Hotel, Reservation } from "./types.js";

/** FNV-1a 32-bit. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface EngineOptions extends SeedOptions {
  readonly today?: string;
  readonly now?: () => number;
  readonly search?: Omit<SearchServiceOptions, "today" | "now">;
  readonly reservations?: Omit<ReservationServiceOptions, "today" | "now" | "onChange">;
  readonly payments?: PaymentGateway;
  /** Fraction of room-nights pre-sold at start-up so that demand pricing and sold-out states are visible. 0..0.9 */
  readonly preloadOccupancy?: number;
  readonly onReservationChange?: (r: Reservation) => void;
}

/** One object wiring the catalogue, availability, search, payments and reservations together. */
export class Engine {
  readonly hotels: readonly Hotel[];
  readonly hotelById: ReadonlyMap<string, Hotel>;
  readonly availability: AvailabilityIndex;
  readonly search: SearchService;
  readonly payments: PaymentGateway;
  readonly reservations: ReservationService;
  readonly today: string;

  constructor(opts: EngineOptions = {}) {
    const now = opts.now ?? (() => Date.now());
    this.today = opts.today ?? "2026-01-01";
    this.hotels = seedHotels(opts);
    this.hotelById = new Map(this.hotels.map((h) => [h.id, h]));
    const startDay = isoToDay(this.today);
    const fraction = opts.preloadOccupancy ?? 0;
    this.availability = new AvailabilityIndex(
      fraction > 0
        ? (roomTypeId, tree, capacity) => {
            // Deterministic pre-sold stays derived from the room-type id, applied when the tree is first touched.
            let s = (hashString(roomTypeId) ^ ((opts.seed ?? 42) >>> 0)) >>> 0;
            const rnd = (): number => {
              s = (s * 1664525 + 1013904223) >>> 0;
              return s / 4294967296;
            };
            const stays = Math.floor(capacity * fraction * 40);
            for (let i = 0; i < stays; i++) {
              const d = startDay + Math.floor(rnd() * (HORIZON_DAYS - startDay - 8));
              const nights = 1 + Math.floor(rnd() * 5);
              if (tree.rangeMin(d, d + nights) >= 1) tree.rangeAdd(d, d + nights, -1);
            }
          }
        : undefined,
    );
    for (const h of this.hotels) for (const r of h.roomTypes) this.availability.addRoomType(r.id, r.totalUnits);

    this.search = new SearchService(this.hotels, this.availability, { ...opts.search, today: this.today, now });
    this.payments = opts.payments ?? new MockPaymentGateway(now);
    this.reservations = new ReservationService(this.hotels, this.availability, this.payments, {
      ...opts.reservations,
      today: this.today,
      now,
      onChange: (r) => {
        const hotel = this.hotelById.get(r.hotelId);
        if (hotel) this.search.invalidateCity(hotel.city);
        opts.onReservationChange?.(r);
      },
    });
  }

}
