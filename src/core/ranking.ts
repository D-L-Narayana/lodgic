import { convert } from "./money.js";
import { RANKER_MODEL, type RankerModel } from "./model.js";
import type { Hotel, PriceBreakdown, RoomType, TravellerProfile } from "./types.js";

/** Feature names, in model order. Must match ml/train_ranker.py. */
export const FEATURE_NAMES = [
  "log_price",
  "rating",
  "log_reviews",
  "distance_km",
  "stars",
  "popularity",
  "free_cancellation",
  "breakfast",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export function featureVector(hotel: Hotel, room: RoomType, q: PriceBreakdown): number[] {
  // price feature is always computed in INR so that the model is currency independent
  const nightlyInr = convert(q.averageNightly, q.currency, "INR") / 100; // rupees
  return [
    Math.log(Math.max(1, nightlyInr)),
    hotel.rating,
    Math.log1p(hotel.reviewCount),
    hotel.distanceToCentreKm,
    hotel.stars,
    hotel.popularity,
    room.refundable ? 1 : 0,
    room.breakfastIncluded ? 1 : 0,
  ];
}

/** Rule-based personalisation applied on top of the learned weights. */
export const PROFILE_BOOSTS: Readonly<Record<TravellerProfile, Partial<Record<FeatureName, number>>>> = {
  leisure: {},
  budget: { log_price: 1.6 },
  business: { distance_km: 1.6, free_cancellation: 1.4 },
  family: { breakfast: 1.6, stars: 1.2 },
};

export function effectiveWeights(model: RankerModel, profile?: TravellerProfile): number[] {
  const boosts = profile ? PROFILE_BOOSTS[profile] : {};
  return model.weights.map((w, i) => {
    const name = FEATURE_NAMES[i]!;
    const b = boosts[name];
    return b === undefined ? w : w * b;
  });
}

export interface ScoredCandidate {
  readonly score: number; // probability-like 0..1
  readonly contributions: readonly { readonly feature: FeatureName; readonly value: number }[];
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Score one candidate with the logistic-regression learning-to-rank model. */
export function scoreCandidate(
  features: readonly number[],
  model: RankerModel = RANKER_MODEL,
  profile?: TravellerProfile,
): ScoredCandidate {
  const w = effectiveWeights(model, profile);
  let z = model.bias;
  const contributions: { feature: FeatureName; value: number }[] = [];
  for (let i = 0; i < features.length; i++) {
    const std = model.std[i]! || 1;
    const normalised = (features[i]! - model.mean[i]!) / std;
    const c = w[i]! * normalised;
    z += c;
    contributions.push({ feature: FEATURE_NAMES[i]!, value: c });
  }
  contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return { score: sigmoid(z), contributions };
}

const FEATURE_LABEL: Readonly<Record<FeatureName, [positive: string, negative: string]>> = {
  log_price: ["great price for the area", "priced above similar stays"],
  rating: ["highly rated by guests", "below-average guest rating"],
  log_reviews: ["many verified reviews", "few reviews yet"],
  distance_km: ["close to the centre", "far from the centre"],
  stars: ["higher star class", "lower star class"],
  popularity: ["popular with travellers", "rarely booked"],
  free_cancellation: ["free cancellation", "non-refundable"],
  breakfast: ["breakfast included", "breakfast not included"],
};

/** Human-readable reasons for the top contributing features. */
export function explain(scored: ScoredCandidate, limit: number = 2): string[] {
  return scored.contributions.slice(0, limit).map((c) => {
    const [pos, neg] = FEATURE_LABEL[c.feature];
    return c.value >= 0 ? pos : neg;
  });
}
