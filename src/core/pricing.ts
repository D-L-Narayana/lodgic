import { dayOfWeek, monthOf } from "./calendar.js";
import { convert, roundHalfUp, scale } from "./money.js";
import type { CurrencyCode, PriceBreakdown, RoomType } from "./types.js";

/** Seasonality multipliers by month (0 = Jan). Peak season Oct–Feb for Indian leisure travel + Dec holidays. */
export const SEASON_MULTIPLIER: readonly number[] = [1.15, 1.05, 1.0, 0.95, 0.9, 0.85, 0.9, 0.95, 1.0, 1.1, 1.15, 1.3];

export interface PricingParams {
  /** Uplift applied on Friday and Saturday nights. */
  readonly weekendUplift: number; // e.g. 0.15
  /** Max demand uplift when a room type is almost sold out. */
  readonly maxDemandUplift: number; // e.g. 0.35
  /** Length-of-stay discount thresholds (nights) and rates. */
  readonly losDiscounts: readonly { readonly minNights: number; readonly rate: number }[];
  /** Taxes + fees rate applied on the discounted subtotal. */
  readonly taxRate: number; // e.g. 0.12 (India GST slab for mid-range rooms)
}

export const DEFAULT_PRICING: PricingParams = {
  weekendUplift: 0.15,
  maxDemandUplift: 0.35,
  losDiscounts: [
    { minNights: 7, rate: 0.1 },
    { minNights: 3, rate: 0.05 },
  ],
  taxRate: 0.12,
};

/**
 * Demand uplift as a smooth function of occupancy: nothing below 50 %, ramping
 * quadratically to `maxDemandUplift` at 100 % occupancy.
 */
export function demandUplift(occupancy: number, params: PricingParams = DEFAULT_PRICING): number {
  const o = Math.min(1, Math.max(0, occupancy));
  if (o <= 0.5) return 0;
  const x = (o - 0.5) / 0.5;
  return params.maxDemandUplift * x * x;
}

/** Nightly price (minor units, hotel currency) for one room on one night. */
export function nightlyRate(
  room: RoomType,
  day: number,
  occupancy: number,
  params: PricingParams = DEFAULT_PRICING,
): number {
  const dow = dayOfWeek(day);
  const weekend = dow === 5 || dow === 6 ? 1 + params.weekendUplift : 1;
  const season = SEASON_MULTIPLIER[monthOf(day)]!;
  const demand = 1 + demandUplift(occupancy, params);
  return scale(room.baseRate, season * weekend * demand);
}

export function lengthOfStayDiscountRate(nights: number, params: PricingParams = DEFAULT_PRICING): number {
  for (const tier of params.losDiscounts) if (nights >= tier.minNights) return tier.rate;
  return 0;
}

/**
 * Full quote for `rooms` rooms over the nights [startDay, endDay). All arithmetic in
 * integer minor units; conversion to the display currency happens once on each
 * component so the breakdown still sums to the total.
 */
export function quote(
  room: RoomType,
  hotelCurrency: CurrencyCode,
  startDay: number,
  endDay: number,
  rooms: number,
  occupancy: number,
  displayCurrency: CurrencyCode = hotelCurrency,
  params: PricingParams = DEFAULT_PRICING,
): PriceBreakdown {
  const nights = endDay - startDay;
  if (nights < 1) throw new RangeError("a stay needs at least one night");
  if (rooms < 1) throw new RangeError("rooms must be >= 1");

  const nightlyHotelCcy: number[] = [];
  for (let d = startDay; d < endDay; d++) nightlyHotelCcy.push(nightlyRate(room, d, occupancy, params));

  const nightly = nightlyHotelCcy.map((n) => convert(n, hotelCurrency, displayCurrency));
  const roomsSubtotal = nightly.reduce((a, b) => a + b, 0) * rooms;
  const losRate = lengthOfStayDiscountRate(nights, params);
  const lengthOfStayDiscount = -roundHalfUp(roomsSubtotal * losRate);
  const discounted = roomsSubtotal + lengthOfStayDiscount;
  const taxesAndFees = roundHalfUp(discounted * params.taxRate);
  const total = discounted + taxesAndFees;

  return {
    currency: displayCurrency,
    nightly,
    roomsSubtotal,
    lengthOfStayDiscount,
    taxesAndFees,
    total,
    averageNightly: Math.round(total / (nights * rooms)),
    nights,
    rooms,
  };
}
