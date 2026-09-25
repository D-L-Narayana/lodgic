/** Shared domain types for the Lodgic engine. */

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "JPY" | "KWD" | "SGD" | "AED";

/** Money is always carried as an integer amount of minor units (paise, cents, fils...). */
export interface Money {
  readonly amount: number; // integer minor units
  readonly currency: CurrencyCode;
}

export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

export type Amenity =
  | "wifi"
  | "breakfast"
  | "pool"
  | "gym"
  | "parking"
  | "spa"
  | "airport_shuttle"
  | "pet_friendly"
  | "restaurant"
  | "bar";

export interface RoomType {
  readonly id: string;
  readonly hotelId: string;
  readonly name: string;
  readonly capacity: number; // max guests per room
  readonly totalUnits: number; // physical inventory
  /** Base nightly rate in the hotel's currency, minor units. */
  readonly baseRate: number;
  readonly refundable: boolean;
  readonly breakfastIncluded: boolean;
}

export interface Hotel {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly stars: 1 | 2 | 3 | 4 | 5;
  readonly rating: number; // 0..10 guest rating
  readonly reviewCount: number;
  readonly location: GeoPoint;
  readonly distanceToCentreKm: number;
  readonly amenities: readonly Amenity[];
  readonly currency: CurrencyCode;
  /** Popularity prior, 0..1 (e.g. normalised historic bookings). */
  readonly popularity: number;
  readonly roomTypes: readonly RoomType[];
}

export type SortOrder = "recommended" | "price_asc" | "price_desc" | "rating_desc" | "distance_asc";

export interface SearchQuery {
  readonly city: string;
  readonly checkIn: string; // ISO date YYYY-MM-DD
  readonly checkOut: string; // ISO date YYYY-MM-DD (exclusive)
  readonly guests: number;
  readonly rooms?: number;
  readonly currency?: CurrencyCode;
  readonly minStars?: number;
  readonly maxNightlyPrice?: number; // in display currency minor units
  readonly amenities?: readonly Amenity[];
  readonly freeCancellation?: boolean;
  readonly sort?: SortOrder;
  readonly page?: number; // 1-based
  readonly pageSize?: number;
  readonly traveller?: TravellerProfile;
}

/** Lightweight personalisation signal. */
export type TravellerProfile = "leisure" | "business" | "family" | "budget";

export interface PriceBreakdown {
  readonly currency: CurrencyCode;
  readonly nightly: readonly number[]; // per-night price in minor units, after dynamic pricing
  readonly roomsSubtotal: number;
  readonly lengthOfStayDiscount: number; // negative or zero
  readonly taxesAndFees: number;
  readonly total: number;
  readonly averageNightly: number;
  readonly nights: number;
  readonly rooms: number;
}

export interface SearchHit {
  readonly hotel: Hotel;
  readonly roomType: RoomType;
  readonly quote: PriceBreakdown;
  readonly unitsLeft: number;
  readonly score: number;
  readonly explanation: readonly string[];
}

export interface SearchFacets {
  readonly stars: Readonly<Record<string, number>>;
  readonly priceBuckets: readonly { readonly upTo: number; readonly count: number }[];
}

export interface SearchResult {
  readonly query: SearchQuery;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hits: readonly SearchHit[];
  readonly facets: SearchFacets;
  readonly cache: "hit" | "miss";
  readonly tookMs: number;
}

export type ReservationStatus = "HELD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";

export interface Guest {
  readonly name: string;
  readonly email: string;
}

export interface Reservation {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly hotelId: string;
  readonly roomTypeId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly rooms: number;
  readonly guests: number;
  readonly guest: Guest;
  readonly quote: PriceBreakdown;
  status: ReservationStatus;
  readonly createdAt: number;
  readonly holdExpiresAt: number;
  paymentIntentId?: string;
  confirmedAt?: number;
  cancelledAt?: number;
}

export type PaymentStatus = "requires_confirmation" | "succeeded" | "failed" | "refunded";

export interface PaymentIntent {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  status: PaymentStatus;
  readonly createdAt: number;
  failureReason?: string;
  refundedAt?: number;
}

/** A supplier price feed row (used by k-way merge + de-duplication). */
export interface SupplierRate {
  readonly supplier: string;
  readonly hotelName: string;
  readonly location: GeoPoint;
  readonly roomName: string;
  readonly nightlyRate: number; // minor units
  readonly currency: CurrencyCode;
}
