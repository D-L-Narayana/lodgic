import { AvailabilityIndex } from "./availability.js";
import { HORIZON_DAYS, isoToDay } from "./calendar.js";
import { MockPaymentGateway, type PaymentGateway } from "./payments.js";
import { ReservationService, type ReservationServiceOptions } from "./reservations.js";
import { SearchService, type SearchServiceOptions } from "./search.js";
import { seedHotels, type SeedOptions } from "./seed.js";
import type { Hotel, Reservation } from "./types.js";

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
    this.availability = new AvailabilityIndex();
    for (const h of this.hotels) for (const r of h.roomTypes) this.availability.addRoomType(r.id, r.totalUnits);
    if (opts.preloadOccupancy) this.preload(opts.preloadOccupancy, opts.seed ?? 42);

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

  /** Deterministically pre-sell inventory so the demo shows realistic scarcity. */
  private preload(fraction: number, seed: number): void {
    let s = seed >>> 0;
    const rnd = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const start = isoToDay(this.today);
    for (const h of this.hotels) {
      for (const r of h.roomTypes) {
        const stays = Math.floor(r.totalUnits * fraction * 40); // ~40 stays per unit per horizon
        for (let i = 0; i < stays; i++) {
          const d = start + Math.floor(rnd() * (HORIZON_DAYS - start - 8));
          const nights = 1 + Math.floor(rnd() * 5);
          this.availability.hold(r.id, d, d + nights, 1); // ignore failures: already sold out
        }
      }
    }
  }
}
