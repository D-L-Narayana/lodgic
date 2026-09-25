import type { Amenity, CurrencyCode, Hotel, RoomType } from "./types.js";

/** mulberry32: tiny deterministic PRNG so every run (and the browser demo) sees the same catalogue. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CityDef {
  readonly name: string;
  readonly country: string;
  readonly currency: CurrencyCode;
  readonly centre: { lat: number; lng: number };
  readonly priceLevel: number; // multiplier on INR base prices
}

export const CITIES: readonly CityDef[] = [
  { name: "Bengaluru", country: "India", currency: "INR", centre: { lat: 12.9716, lng: 77.5946 }, priceLevel: 1.0 },
  { name: "Goa", country: "India", currency: "INR", centre: { lat: 15.4909, lng: 73.8278 }, priceLevel: 1.1 },
  { name: "Mumbai", country: "India", currency: "INR", centre: { lat: 19.076, lng: 72.8777 }, priceLevel: 1.35 },
  { name: "New Delhi", country: "India", currency: "INR", centre: { lat: 28.6139, lng: 77.209 }, priceLevel: 1.2 },
  { name: "Jaipur", country: "India", currency: "INR", centre: { lat: 26.9124, lng: 75.7873 }, priceLevel: 0.85 },
  { name: "Hyderabad", country: "India", currency: "INR", centre: { lat: 17.385, lng: 78.4867 }, priceLevel: 0.95 },
  { name: "Visakhapatnam", country: "India", currency: "INR", centre: { lat: 17.6868, lng: 83.2185 }, priceLevel: 0.7 },
  { name: "Chennai", country: "India", currency: "INR", centre: { lat: 13.0827, lng: 80.2707 }, priceLevel: 0.95 },
  { name: "Kolkata", country: "India", currency: "INR", centre: { lat: 22.5726, lng: 88.3639 }, priceLevel: 0.85 },
  { name: "Pune", country: "India", currency: "INR", centre: { lat: 18.5204, lng: 73.8567 }, priceLevel: 0.9 },
  { name: "Kochi", country: "India", currency: "INR", centre: { lat: 9.9312, lng: 76.2673 }, priceLevel: 0.85 },
  { name: "Udaipur", country: "India", currency: "INR", centre: { lat: 24.5854, lng: 73.7125 }, priceLevel: 1.0 },
  { name: "Varanasi", country: "India", currency: "INR", centre: { lat: 25.3176, lng: 82.9739 }, priceLevel: 0.7 },
  { name: "Manali", country: "India", currency: "INR", centre: { lat: 32.2432, lng: 77.1892 }, priceLevel: 0.8 },
  { name: "Rishikesh", country: "India", currency: "INR", centre: { lat: 30.0869, lng: 78.2676 }, priceLevel: 0.7 },
  { name: "Amsterdam", country: "Netherlands", currency: "EUR", centre: { lat: 52.3676, lng: 4.9041 }, priceLevel: 3.2 },
  { name: "London", country: "United Kingdom", currency: "GBP", centre: { lat: 51.5072, lng: -0.1276 }, priceLevel: 3.6 },
  { name: "Paris", country: "France", currency: "EUR", centre: { lat: 48.8566, lng: 2.3522 }, priceLevel: 3.4 },
  { name: "Barcelona", country: "Spain", currency: "EUR", centre: { lat: 41.3874, lng: 2.1686 }, priceLevel: 2.6 },
  { name: "Rome", country: "Italy", currency: "EUR", centre: { lat: 41.9028, lng: 12.4964 }, priceLevel: 2.8 },
  { name: "Lisbon", country: "Portugal", currency: "EUR", centre: { lat: 38.7223, lng: -9.1393 }, priceLevel: 2.2 },
  { name: "Berlin", country: "Germany", currency: "EUR", centre: { lat: 52.52, lng: 13.405 }, priceLevel: 2.4 },
  { name: "Prague", country: "Czechia", currency: "EUR", centre: { lat: 50.0755, lng: 14.4378 }, priceLevel: 2.0 },
  { name: "Istanbul", country: "Türkiye", currency: "EUR", centre: { lat: 41.0082, lng: 28.9784 }, priceLevel: 1.6 },
  { name: "Manchester", country: "United Kingdom", currency: "GBP", centre: { lat: 53.4808, lng: -2.2426 }, priceLevel: 2.4 },
  { name: "Singapore", country: "Singapore", currency: "SGD", centre: { lat: 1.3521, lng: 103.8198 }, priceLevel: 3.0 },
  { name: "Dubai", country: "United Arab Emirates", currency: "AED", centre: { lat: 25.2048, lng: 55.2708 }, priceLevel: 2.8 },
  { name: "Tokyo", country: "Japan", currency: "JPY", centre: { lat: 35.6762, lng: 139.6503 }, priceLevel: 2.6 },
  { name: "Kyoto", country: "Japan", currency: "JPY", centre: { lat: 35.0116, lng: 135.7681 }, priceLevel: 2.4 },
  { name: "Bangkok", country: "Thailand", currency: "USD", centre: { lat: 13.7563, lng: 100.5018 }, priceLevel: 1.3 },
  { name: "Bali", country: "Indonesia", currency: "USD", centre: { lat: -8.4095, lng: 115.1889 }, priceLevel: 1.2 },
  { name: "Kuala Lumpur", country: "Malaysia", currency: "USD", centre: { lat: 3.139, lng: 101.6869 }, priceLevel: 1.2 },
  { name: "Hong Kong", country: "Hong Kong", currency: "USD", centre: { lat: 22.3193, lng: 114.1694 }, priceLevel: 3.0 },
  { name: "Seoul", country: "South Korea", currency: "USD", centre: { lat: 37.5665, lng: 126.978 }, priceLevel: 2.3 },
  { name: "Sydney", country: "Australia", currency: "USD", centre: { lat: -33.8688, lng: 151.2093 }, priceLevel: 2.9 },
  { name: "New York", country: "United States", currency: "USD", centre: { lat: 40.7128, lng: -74.006 }, priceLevel: 4.2 },
  { name: "San Francisco", country: "United States", currency: "USD", centre: { lat: 37.7749, lng: -122.4194 }, priceLevel: 4.0 },
  { name: "Toronto", country: "Canada", currency: "USD", centre: { lat: 43.6532, lng: -79.3832 }, priceLevel: 2.6 },
  { name: "Cape Town", country: "South Africa", currency: "USD", centre: { lat: -33.9249, lng: 18.4241 }, priceLevel: 1.5 },
  { name: "Doha", country: "Qatar", currency: "AED", centre: { lat: 25.2854, lng: 51.531 }, priceLevel: 2.6 },
];

const NAME_A = ["Grand", "Royal", "Lotus", "Coastal", "Urban", "Heritage", "Harbour", "Garden", "Summit", "Palm", "Azure", "Amber", "Cedar", "Ivory", "Monsoon", "Saffron", "Sapphire", "Silver", "Sunrise", "Velvet"];
const NAME_B = ["Residency", "Retreat", "Suites", "Inn", "Palace", "House", "Lodge", "Plaza", "Court", "Towers", "Villas", "Boutique", "Stay", "Haven", "Manor"];
const NAME_SUFFIX = ["Central", "Riverside", "Old Town", "Marina", "Garden", "Hills", "Park", "Seafront", "Downtown", "Station", "Heights", "Bay"];
const ROOM_NAMES: readonly [string, number, number][] = [
  ["Standard Room", 2, 1.0],
  ["Deluxe Room", 2, 1.35],
  ["Family Suite", 4, 2.1],
  ["Executive Suite", 3, 2.6],
];
const AMENITIES: readonly Amenity[] = ["wifi", "breakfast", "pool", "gym", "parking", "spa", "airport_shuttle", "pet_friendly", "restaurant", "bar"];

/** INR minor-unit base rates per star class (rupees × 100). */
const BASE_RATE_INR = [120_000, 220_000, 380_000, 700_000, 1_400_000];

export interface SeedOptions {
  readonly hotelsPerCity?: number;
  readonly seed?: number;
}

/** FX from INR into the hotel currency, as used by the seed to set local base rates. */
const INR_TO: Readonly<Record<CurrencyCode, number>> = {
  INR: 1,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0094,
  JPY: 1.78,
  KWD: 0.0037,
  SGD: 0.0162,
  AED: 0.0441,
};
const EXP: Readonly<Record<CurrencyCode, number>> = { INR: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, KWD: 3, SGD: 2, AED: 2 };

export function seedHotels(opts: SeedOptions = {}): Hotel[] {
  const perCity = opts.hotelsPerCity ?? 100;
  const next = rng(opts.seed ?? 42);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!;
  const hotels: Hotel[] = [];
  const usedNames = new Set<string>();

  for (const city of CITIES) {
    for (let i = 0; i < perCity; i++) {
      const id = `h_${city.name.toLowerCase().replace(/\s+/g, "-")}_${i + 1}`;
      let name = `${pick(NAME_A)} ${pick(NAME_B)}`;
      for (let k = 0; usedNames.has(`${city.name}|${name}`); k++) name = `${name.split(" ").slice(0, 2).join(" ")} ${NAME_SUFFIX[(i + k) % NAME_SUFFIX.length]}`;
      usedNames.add(`${city.name}|${name}`);

      const u = next();
      const stars = (u < 0.06 ? 1 : u < 0.22 ? 2 : u < 0.58 ? 3 : u < 0.88 ? 4 : 5) as Hotel["stars"];
      const rating = Math.min(10, Math.max(2, 6.0 + 0.55 * stars + (next() - 0.5) * 2.2));
      const reviewCount = Math.floor(Math.exp(4.2 + 0.35 * stars + (next() - 0.5) * 2.4));
      const distanceToCentreKm = Math.round((Math.pow(next(), 1.6) * 14 + 0.2) * 10) / 10;
      const bearing = next() * Math.PI * 2;
      const location = {
        lat: Math.round((city.centre.lat + (distanceToCentreKm / 111) * Math.cos(bearing)) * 1e5) / 1e5,
        lng: Math.round((city.centre.lng + (distanceToCentreKm / 111) * Math.sin(bearing)) * 1e5) / 1e5,
      };
      const amenityCount = 2 + Math.floor(next() * (stars + 3));
      const amenities = [...new Set(Array.from({ length: amenityCount }, () => pick(AMENITIES)))];
      const popularity = Math.min(1, Math.max(0, 0.15 + 0.08 * stars + (next() - 0.5) * 0.5));

      const baseInr = BASE_RATE_INR[stars - 1]! * city.priceLevel * (0.8 + next() * 0.5);
      const toLocal = (inrMinor: number): number => {
        const rupees = inrMinor / 100;
        const major = rupees * INR_TO[city.currency];
        return Math.max(1, Math.round(major * 10 ** EXP[city.currency]));
      };

      const roomCount = 2 + Math.floor(next() * 3); // 2..4 room types
      const roomTypes: RoomType[] = [];
      for (let r = 0; r < roomCount; r++) {
        const [rname, capacity, mult] = ROOM_NAMES[r]!;
        roomTypes.push({
          id: `${id}_r${r + 1}`,
          hotelId: id,
          name: rname,
          capacity,
          totalUnits: 2 + Math.floor(next() * 10),
          baseRate: toLocal(baseInr * mult),
          refundable: next() < 0.55,
          breakfastIncluded: next() < 0.3 + 0.1 * stars,
        });
      }

      hotels.push({
        id,
        name,
        city: city.name,
        country: city.country,
        stars,
        rating: Math.round(rating * 10) / 10,
        reviewCount,
        location,
        distanceToCentreKm,
        amenities,
        currency: city.currency,
        popularity: Math.round(popularity * 100) / 100,
        roomTypes,
      });
    }
  }
  return hotels;
}
