/**
 * Date helpers. Days are indexed as integers relative to an epoch so that
 * availability can live in flat typed arrays and range queries are cheap.
 */

const DAY_MS = 86_400_000;

/** Horizon start: engine day 0. */
export const EPOCH_ISO = "2026-01-01";
export const EPOCH_MS = Date.UTC(2026, 0, 1);
/** Number of days tracked by the availability index. */
export const HORIZON_DAYS = 730;

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === s;
}

export function isoToDay(iso: string): number {
  if (!isIsoDate(iso)) throw new RangeError(`invalid ISO date: ${iso}`);
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - EPOCH_MS) / DAY_MS);
}

export function dayToIso(day: number): string {
  return new Date(EPOCH_MS + day * DAY_MS).toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return isoToDay(checkOut) - isoToDay(checkIn);
}

/** 0 = Sunday ... 6 = Saturday (UTC). */
export function dayOfWeek(day: number): number {
  return new Date(EPOCH_MS + day * DAY_MS).getUTCDay();
}

export function monthOf(day: number): number {
  return new Date(EPOCH_MS + day * DAY_MS).getUTCMonth(); // 0..11
}

export interface DayRange {
  readonly start: number; // inclusive
  readonly end: number; // exclusive
}

/**
 * Merge overlapping / touching [start, end) ranges. O(n log n).
 * A classic interview problem, used here to normalise supplier stop-sell calendars.
 */
export function mergeRanges(ranges: readonly DayRange[]): DayRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: DayRange[] = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.start <= cur.end) {
      if (r.end > cur.end) cur = { start: cur.start, end: r.end };
    } else {
      out.push(cur);
      cur = { ...r };
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse a supplier availability calendar in the compact text form suppliers
 * commonly send: comma-separated ISO dates or `start..end` ranges (end exclusive),
 * e.g. "2026-03-01..2026-03-05,2026-03-10". Returns merged, sorted day ranges.
 * Tolerates whitespace and blank entries; throws on malformed dates.
 */
export function parseAvailabilityCalendar(text: string): DayRange[] {
  const ranges: DayRange[] = [];
  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const [a, b] = part.split("..");
    const start = isoToDay(a!.trim());
    const end = b === undefined ? start + 1 : isoToDay(b.trim());
    if (end <= start) throw new RangeError(`empty or inverted range: ${part}`);
    ranges.push({ start, end });
  }
  return mergeRanges(ranges);
}

export function validateStay(checkIn: string, checkOut: string, today: string = EPOCH_ISO): void {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw new RangeError("checkIn/checkOut must be ISO dates (YYYY-MM-DD)");
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new RangeError("checkOut must be after checkIn");
  if (nights > 30) throw new RangeError("stays longer than 30 nights are not supported");
  if (isoToDay(checkIn) < isoToDay(today)) throw new RangeError("checkIn is in the past");
  if (isoToDay(checkOut) > HORIZON_DAYS) throw new RangeError("checkOut is beyond the bookable horizon");
}
