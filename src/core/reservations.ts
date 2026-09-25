import type { AvailabilityIndex } from "./availability.js";
import { isoToDay, validateStay } from "./calendar.js";
import type { PaymentGateway } from "./payments.js";
import { quote } from "./pricing.js";
import type { CurrencyCode, Guest, Hotel, Reservation, RoomType } from "./types.js";

export class ReservationError extends Error {
  constructor(
    readonly code: "SOLD_OUT" | "NOT_FOUND" | "INVALID" | "HOLD_EXPIRED" | "BAD_STATE" | "PAYMENT_FAILED" | "AMOUNT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

export interface CreateReservationInput {
  readonly idempotencyKey: string;
  readonly roomTypeId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly rooms?: number;
  readonly guests: number;
  readonly guest: Guest;
  readonly currency?: CurrencyCode;
}

export interface ReservationServiceOptions {
  readonly holdMinutes?: number;
  readonly now?: () => number;
  readonly today?: string;
  readonly onChange?: (r: Reservation) => void; // hook for cache invalidation / event log
}

/**
 * Reservation lifecycle:
 *
 *   create ──► HELD ──confirm(payment ok)──► CONFIRMED ──cancel──► CANCELLED
 *               │ hold timer                                      (units released, payment refunded)
 *               └──expire/cancel──► EXPIRED / CANCELLED (units released)
 *
 * Guarantees
 *  - No double booking: the availability hold is atomic and all-or-nothing.
 *  - Idempotent create: the same idempotencyKey always returns the same reservation,
 *    so a client retrying after a timeout never books twice.
 *  - Confirm re-checks the hold expiry and that the payment amount equals the quote.
 */
export class ReservationService {
  private readonly byId = new Map<string, Reservation>();
  private readonly byIdempotencyKey = new Map<string, string>();
  private readonly roomIndex = new Map<string, { hotel: Hotel; room: RoomType }>();
  private readonly holdMs: number;
  private readonly now: () => number;
  private readonly today: string;
  private readonly onChange: ((r: Reservation) => void) | undefined;
  private seq = 0;

  constructor(
    hotels: readonly Hotel[],
    private readonly availability: AvailabilityIndex,
    private readonly payments: PaymentGateway,
    opts: ReservationServiceOptions = {},
  ) {
    for (const h of hotels) for (const r of h.roomTypes) this.roomIndex.set(r.id, { hotel: h, room: r });
    this.holdMs = (opts.holdMinutes ?? 10) * 60_000;
    this.now = opts.now ?? (() => Date.now());
    this.today = opts.today ?? "2026-01-01";
    this.onChange = opts.onChange;
  }

  get(id: string): Reservation | undefined {
    const r = this.byId.get(id);
    if (r) this.expireIfDue(r);
    return r;
  }

  list(): Reservation[] {
    for (const r of this.byId.values()) this.expireIfDue(r);
    return [...this.byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  create(input: CreateReservationInput): Reservation {
    if (!input.idempotencyKey || input.idempotencyKey.length > 128) throw new ReservationError("INVALID", "idempotencyKey required (<=128 chars)");
    const existingId = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingId) return this.byId.get(existingId)!;

    const entry = this.roomIndex.get(input.roomTypeId);
    if (!entry) throw new ReservationError("NOT_FOUND", `unknown room type ${input.roomTypeId}`);
    const rooms = input.rooms ?? 1;
    try {
      validateStay(input.checkIn, input.checkOut, this.today);
    } catch (e) {
      throw new ReservationError("INVALID", (e as Error).message);
    }
    if (!Number.isInteger(rooms) || rooms < 1 || rooms > 8) throw new ReservationError("INVALID", "rooms must be 1..8");
    if (!Number.isInteger(input.guests) || input.guests < 1) throw new ReservationError("INVALID", "guests must be >= 1");
    if (input.guests > rooms * entry.room.capacity) throw new ReservationError("INVALID", `${entry.room.name} fits ${entry.room.capacity} guests per room`);
    if (!input.guest?.name?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.guest?.email ?? "")) throw new ReservationError("INVALID", "guest name and a valid email are required");

    const startDay = isoToDay(input.checkIn);
    const endDay = isoToDay(input.checkOut);
    // Quote before the hold so the price reflects demand *before* we take the unit(s).
    const occupancy = this.availability.occupancy(entry.room.id, startDay, endDay);
    const q = quote(entry.room, entry.hotel.currency, startDay, endDay, rooms, occupancy, input.currency ?? entry.hotel.currency);

    const hold = this.availability.hold(entry.room.id, startDay, endDay, rooms);
    if (!hold.ok) throw new ReservationError("SOLD_OUT", `only ${hold.unitsLeft} unit(s) left for these dates`);

    const now = this.now();
    const r: Reservation = {
      id: `res_${(++this.seq).toString(36)}_${now.toString(36)}`,
      idempotencyKey: input.idempotencyKey,
      hotelId: entry.hotel.id,
      roomTypeId: entry.room.id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms,
      guests: input.guests,
      guest: { name: input.guest.name.trim(), email: input.guest.email.trim().toLowerCase() },
      quote: q,
      status: "HELD",
      createdAt: now,
      holdExpiresAt: now + this.holdMs,
    };
    this.byId.set(r.id, r);
    this.byIdempotencyKey.set(input.idempotencyKey, r.id);
    this.onChange?.(r);
    return r;
  }

  /** Confirm a held reservation by charging the supplied payment intent. */
  confirm(reservationId: string, paymentIntentId: string): Reservation {
    const r = this.byId.get(reservationId);
    if (!r) throw new ReservationError("NOT_FOUND", `unknown reservation ${reservationId}`);
    this.expireIfDue(r);
    if (r.status === "CONFIRMED") return r; // idempotent confirm
    if (r.status !== "HELD") throw new ReservationError("BAD_STATE", `reservation is ${r.status}`);

    const intent = this.payments.get(paymentIntentId);
    if (!intent) throw new ReservationError("NOT_FOUND", `unknown payment intent ${paymentIntentId}`);
    if (intent.amount !== r.quote.total || intent.currency !== r.quote.currency) {
      throw new ReservationError("AMOUNT_MISMATCH", `payment ${intent.amount} ${intent.currency} != quote ${r.quote.total} ${r.quote.currency}`);
    }
    const charged = this.payments.confirm(paymentIntentId);
    if (charged.status !== "succeeded") {
      throw new ReservationError("PAYMENT_FAILED", charged.failureReason ?? "payment declined");
    }
    r.status = "CONFIRMED";
    r.paymentIntentId = paymentIntentId;
    r.confirmedAt = this.now();
    this.onChange?.(r);
    return r;
  }

  cancel(reservationId: string): Reservation {
    const r = this.byId.get(reservationId);
    if (!r) throw new ReservationError("NOT_FOUND", `unknown reservation ${reservationId}`);
    this.expireIfDue(r);
    if (r.status === "CANCELLED" || r.status === "EXPIRED") return r;
    const wasConfirmed = r.status === "CONFIRMED";
    this.release(r);
    r.status = "CANCELLED";
    r.cancelledAt = this.now();
    if (wasConfirmed && r.paymentIntentId) this.payments.refund(r.paymentIntentId);
    this.onChange?.(r);
    return r;
  }

  /** Expire due holds; returns how many were released. Call from a timer in server mode. */
  sweepExpiredHolds(): number {
    let n = 0;
    for (const r of this.byId.values()) if (this.expireIfDue(r)) n++;
    return n;
  }

  private expireIfDue(r: Reservation): boolean {
    if (r.status === "HELD" && r.holdExpiresAt <= this.now()) {
      this.release(r);
      r.status = "EXPIRED";
      this.onChange?.(r);
      return true;
    }
    return false;
  }

  private release(r: Reservation): void {
    this.availability.release(r.roomTypeId, isoToDay(r.checkIn), isoToDay(r.checkOut), r.rooms);
  }
}
