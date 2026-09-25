import type { CurrencyCode, PaymentIntent } from "./types.js";

export interface PaymentGateway {
  createIntent(input: { idempotencyKey: string; amount: number; currency: CurrencyCode; card: string }): PaymentIntent;
  confirm(intentId: string): PaymentIntent;
  refund(intentId: string): PaymentIntent;
  get(intentId: string): PaymentIntent | undefined;
}

/**
 * Deterministic mock gateway modelled on real PSP APIs (intent → confirm → refund):
 *  - Idempotent `createIntent`: same key ⇒ same intent, never a second charge.
 *  - Failure injection by test-card number (same convention as Stripe's test cards):
 *      4000000000000002 → declined, 4000000000009995 → insufficient funds.
 *  - Amounts are integer minor units and must be > 0.
 */
export class MockPaymentGateway implements PaymentGateway {
  private readonly intents = new Map<string, PaymentIntent>();
  private readonly byKey = new Map<string, string>();
  private readonly cards = new Map<string, string>();
  private seq = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  createIntent(input: { idempotencyKey: string; amount: number; currency: CurrencyCode; card: string }): PaymentIntent {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return this.intents.get(existing)!;
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new RangeError("amount must be a positive integer of minor units");
    const card = input.card.replace(/\s+/g, "");
    if (!/^\d{12,19}$/.test(card) || !luhnValid(card)) throw new RangeError("invalid card number");
    const intent: PaymentIntent = {
      id: `pi_${(++this.seq).toString(36)}_${this.now().toString(36)}`,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      currency: input.currency,
      status: "requires_confirmation",
      createdAt: this.now(),
    };
    this.intents.set(intent.id, intent);
    this.byKey.set(input.idempotencyKey, intent.id);
    this.cards.set(intent.id, card);
    return intent;
  }

  confirm(intentId: string): PaymentIntent {
    const intent = this.intents.get(intentId);
    if (!intent) throw new RangeError(`unknown intent ${intentId}`);
    if (intent.status !== "requires_confirmation") return intent; // idempotent
    const card = this.cards.get(intentId) ?? "";
    if (card === "4000000000000002") {
      intent.status = "failed";
      intent.failureReason = "card_declined";
    } else if (card === "4000000000009995") {
      intent.status = "failed";
      intent.failureReason = "insufficient_funds";
    } else {
      intent.status = "succeeded";
    }
    return intent;
  }

  refund(intentId: string): PaymentIntent {
    const intent = this.intents.get(intentId);
    if (!intent) throw new RangeError(`unknown intent ${intentId}`);
    if (intent.status === "refunded") return intent;
    if (intent.status !== "succeeded") throw new RangeError(`cannot refund a payment in state ${intent.status}`);
    intent.status = "refunded";
    intent.refundedAt = this.now();
    return intent;
  }

  get(intentId: string): PaymentIntent | undefined {
    return this.intents.get(intentId);
  }
}

/** Luhn checksum, as used by every card network. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Test cards that pass Luhn. */
export const TEST_CARDS = {
  success: "4242424242424242",
  declined: "4000000000000002",
  insufficientFunds: "4000000000009995",
} as const;
