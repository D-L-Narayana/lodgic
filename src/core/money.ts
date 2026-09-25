import type { CurrencyCode, Money } from "./types.js";

/**
 * Integer money arithmetic. Every amount is an integer number of minor units, so
 * addition is exact and rounding happens in exactly one place: here.
 *
 * Exponents follow ISO 4217: JPY has no minor unit, KWD has three.
 */
export const CURRENCY_EXPONENT: Readonly<Record<CurrencyCode, number>> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KWD: 3,
  SGD: 2,
  AED: 2,
};

/** Demo FX table: units of quote currency per 1 unit of base currency (INR). */
export const FX_PER_INR: Readonly<Record<CurrencyCode, number>> = {
  INR: 1,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0094,
  JPY: 1.78,
  KWD: 0.0037,
  SGD: 0.0162,
  AED: 0.0441,
};

export function minorUnitsPerMajor(currency: CurrencyCode): number {
  return 10 ** CURRENCY_EXPONENT[currency];
}

/** Round half away from zero to an integer (commercial rounding). */
export function roundHalfUp(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

/** Multiply an integer minor-unit amount by a factor and round once. */
export function scale(amount: number, factor: number): number {
  return roundHalfUp(amount * factor);
}

/**
 * Convert an amount between currencies via the INR cross rate, rounding once at
 * the target currency's minor unit.
 */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const majorFrom = amount / minorUnitsPerMajor(from);
  const inr = majorFrom / FX_PER_INR[from];
  const majorTo = inr * FX_PER_INR[to];
  return roundHalfUp(majorTo * minorUnitsPerMajor(to));
}

/**
 * Split a total across `parts` buckets proportionally to `weights` without losing
 * a single minor unit (largest-remainder method). Used to attribute a stay total to
 * nights for invoices so that the nightly lines always sum to the charged total.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const even = Math.floor(total / weights.length);
    const out = weights.map(() => even);
    let rem = total - even * weights.length;
    for (let i = 0; rem > 0; i++, rem--) out[i % out.length]! += 1;
    return out;
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k++, remainder--) floors[order[k % order.length]!.i]! += 1;
  return floors;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const exp = CURRENCY_EXPONENT[currency];
  const major = amount / 10 ** exp;
  return `${currency} ${major.toLocaleString("en-IN", {
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  })}`;
}

export function money(amount: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amount)) throw new TypeError(`amount must be an integer number of minor units, got ${amount}`);
  return { amount, currency };
}
