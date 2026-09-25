import { CheckCircle2, CreditCard, Lock, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTitle } from "../lib/theme";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TEST_CARDS, luhnValid } from "../../../src/core/payments.js";
import { ReservationError } from "../../../src/core/reservations.js";
import { EmptyState, Img } from "../components/ui";
import { engine, fmtDate, formatMoney, hotelPhotos, loadBookings, parseSearchParams, rememberBooking, updateStoredBooking, type Reservation } from "../lib/engine";

type Step = { label: string; state: "todo" | "doing" | "done" | "failed"; detail?: string };

export function Checkout() {
  const { hotelId = "", roomId = "" } = useParams();
  const [sp] = useSearchParams();
  const q = useMemo(() => parseSearchParams(sp), [sp]);
  const navigate = useNavigate();
  const hotel = engine.hotelById.get(hotelId);
  const room = hotel?.roomTypes.find((r) => r.id === roomId);
  const [name, setName] = useState("Asha Rao");
  const [email, setEmail] = useState("asha@example.com");
  const [card, setCard] = useState(TEST_CARDS.success.replace(/(\d{4})(?=\d)/g, "$1 "));
  const [expiry, setExpiry] = useState("12/28");
  const [cvc, setCvc] = useState("123");
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per checkout attempt — a retry after a network blip reuses it and can never book twice.
  const idem = useRef(`web-${crypto.randomUUID()}`);
  const held = useRef<Reservation | null>(null);

  useTitle("Checkout — Lodgic");

  if (!hotel || !room) {
    return (
      <div className="container-x py-10">
        <EmptyState title="That room isn't available" body="The room type or hotel in this link no longer exists. Search again for live availability." action={<Link to="/" className="btn btn-primary btn-sm">Search</Link>} />
      </div>
    );
  }

  const rooms = q.rooms ?? 1;
  const cardDigits = card.replace(/\s+/g, "");
  const cardOk = /^\d{12,19}$/.test(cardDigits) && luhnValid(cardDigits);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const expiryOk = (() => {
    const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
    if (!m) return false;
    const mm = Number(m[1]), yy = 2000 + Number(m[2]);
    if (mm < 1 || mm > 12) return false;
    const now = new Date();
    return yy > now.getFullYear() || (yy === now.getFullYear() && mm >= now.getMonth() + 1);
  })();
  const nameOk = name.trim().length > 1;
  const cvcOk = /^\d{3,4}$/.test(cvc);
  const canPay = cardOk && emailOk && nameOk && expiryOk && cvcOk && !busy;
  const formatExpiry = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function pay() {
    setBusy(true);
    setError(null);
    const s: Step[] = [
      { label: "Hold the room (atomic availability check)", state: "doing" },
      { label: "Create payment intent for the exact quoted amount", state: "todo" },
      { label: "Confirm payment & reservation", state: "todo" },
    ];
    setSteps([...s]);
    try {
      await wait(450);
      const r = held.current ?? engine.reservations.create({ idempotencyKey: idem.current, roomTypeId: room!.id, checkIn: q.checkIn, checkOut: q.checkOut, rooms, guests: q.guests, guest: { name, email }, ...(q.currency ? { currency: q.currency } : {}) });
      held.current = r;
      rememberBooking({ reservation: { ...r }, hotelName: hotel!.name, city: hotel!.city, roomName: room!.name, photo: hotelPhotos(hotel!.id, 1, 640)[0]! });
      s[0] = { ...s[0]!, state: "done", detail: `${r.id} · held until ${new Date(r.holdExpiresAt).toLocaleTimeString()}` };
      s[1] = { ...s[1]!, state: "doing" };
      setSteps([...s]);
      await wait(500);
      const intent = engine.payments.createIntent({ idempotencyKey: `pay-${idem.current}`, amount: r.quote.total, currency: r.quote.currency, card: cardDigits });
      s[1] = { ...s[1]!, state: "done", detail: `${intent.id} · ${formatMoney(intent.amount, intent.currency)}` };
      s[2] = { ...s[2]!, state: "doing" };
      setSteps([...s]);
      await wait(600);
      const confirmed = engine.reservations.confirm(r.id, intent.id);
      updateStoredBooking(confirmed);
      s[2] = { ...s[2]!, state: "done", detail: `payment succeeded · confirmed ${new Date(confirmed.confirmedAt!).toLocaleTimeString()}` };
      setSteps([...s]);
      await wait(400);
      navigate(`/confirmation/${confirmed.id}`);
    } catch (e) {
      const err = e as Error;
      const code = err instanceof ReservationError ? err.code : "ERROR";
      const idx = s.findIndex((x) => x.state === "doing");
      if (idx >= 0) s[idx] = { ...s[idx]!, state: "failed", detail: `${code}: ${err.message}` };
      setSteps([...s]);
      if (code === "SOLD_OUT") setError("Someone booked the last room a moment ago. Nothing was charged — pick another room type or dates.");
      else if (code === "PAYMENT_FAILED") setError(`Your card was declined (${err.message}). The room stays held for 10 minutes — try another card, e.g. 4242 4242 4242 4242.`);
      else setError(err.message);
      if (held.current) updateStoredBooking(engine.reservations.get(held.current.id)!);
    } finally {
      setBusy(false);
    }
  }

  // live quote (before the hold) for the summary
  const start = new Date(`${q.checkIn}T00:00:00Z`);
  const preview = held.current?.quote ?? engine.search.search({ city: hotel.city, checkIn: q.checkIn, checkOut: q.checkOut, guests: q.guests, rooms, pageSize: 50, ...(q.currency ? { currency: q.currency } : {}) }).hits.find((h) => h.roomType.id === room.id)?.quote;

  return (
    <div className="container-x py-8 grid lg:grid-cols-[1fr_400px] gap-8">
      <div className="grid gap-6 rise">
        <div>
          <span className="eyebrow">Checkout</span>
          <h1 className="text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)] mt-1">Almost there</h1>
          <p className="muted text-sm mt-1">Mock payment — no real money moves. Test cards: <button type="button" className="chip tabular" onClick={() => setCard("4242 4242 4242 4242")}>4242 4242 4242 4242</button> succeeds, <button type="button" className="chip tabular" onClick={() => setCard("4000 0000 0000 0002")}>4000 0000 0000 0002</button> is declined.</p>
        </div>
        <form className="card p-5 grid gap-4" onSubmit={(e) => { e.preventDefault(); void pay(); }} aria-label="Guest and payment details">
          <h2 className="text-lg">Guest</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label><span className="label">Full name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" aria-invalid={!nameOk} /></label>
            <label><span className="label">Email</span><input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" aria-invalid={!emailOk} />{!emailOk && email.length > 0 && <span className="text-xs text-coral mt-1 block">Enter a valid email address.</span>}</label>
          </div>
          <h2 className="text-lg mt-2 flex items-center gap-2"><CreditCard size={18} className="text-accent" /> Payment</h2>
          <label>
            <span className="label">Card number</span>
            <input className="input tabular" inputMode="numeric" placeholder="1234 5678 9012 3456" value={card} onChange={(e) => setCard(e.target.value.replace(/[^\d]/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 "))} aria-invalid={!cardOk} autoComplete="cc-number" />
            {!cardOk && card.length > 0 && <span className="text-xs text-coral mt-1 block">Card number fails the Luhn check.</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Expiry</span><input className="input tabular" inputMode="numeric" value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} placeholder="MM/YY" autoComplete="cc-exp" aria-invalid={!expiryOk} />{!expiryOk && expiry.length >= 5 && <span className="text-xs text-coral mt-1 block">Use MM/YY, not in the past.</span>}</label>
            <label><span className="label">CVC</span><input className="input tabular" inputMode="numeric" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} autoComplete="cc-csc" placeholder="123" aria-invalid={!cvcOk} /></label>
          </div>
          {error && <p role="alert" className="text-sm text-coral-ink bg-coral-soft rounded-lg p-3">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={!canPay} aria-busy={busy}>
            <Lock size={16} /> {busy ? "Processing…" : held.current && held.current.status === "HELD" ? `Retry payment · ${preview ? formatMoney(preview.total, preview.currency) : ""}` : `Pay ${preview ? formatMoney(preview.total, preview.currency) : ""}`}
          </button>
          <p className="text-xs faint inline-flex items-center gap-1"><ShieldCheck size={12} /> Idempotency key <code className="tabular">{idem.current.slice(0, 18)}…</code> — retries reuse it, so you can never be booked or charged twice.</p>
        </form>

        {steps.length > 0 && (
          <ol className="card p-5 grid gap-3" aria-live="polite" aria-label="Booking progress">
            {steps.map((s) => (
              <li key={s.label} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 grid place-items-center size-5 rounded-full ${s.state === "done" ? "text-ok" : s.state === "failed" ? "text-coral" : s.state === "doing" ? "text-accent" : "text-ink3"}`}>
                  {s.state === "done" ? <CheckCircle2 size={18} /> : s.state === "failed" ? <XCircle size={18} /> : <span className={`size-2.5 rounded-full ${s.state === "doing" ? "bg-accent animate-pulse" : "bg-line"}`} />}
                </span>
                <span className="grid">
                  <span className={s.state === "todo" ? "faint" : "font-medium"}>{s.label}</span>
                  {s.detail && <span className="text-xs faint tabular">{s.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <aside className="rise rise-d2">
        <div className="card overflow-hidden lg:sticky lg:top-20">
          <Img src={hotelPhotos(hotel.id, 1, 800)[0]!} alt="" className="h-44" priority />
          <div className="p-5 grid gap-3">
            <div>
              <h2 className="text-lg leading-tight">{hotel.name}</h2>
              <p className="text-sm faint">{hotel.city}, {hotel.country}</p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="faint">Check-in</dt><dd className="text-right font-medium">{fmtDate(q.checkIn, { weekday: "short", day: "numeric", month: "short" })}</dd>
              <dt className="faint">Check-out</dt><dd className="text-right font-medium">{fmtDate(q.checkOut, { weekday: "short", day: "numeric", month: "short" })}</dd>
              <dt className="faint">Room</dt><dd className="text-right font-medium">{rooms}× {room.name}</dd>
              <dt className="faint">Guests</dt><dd className="text-right font-medium">{q.guests}</dd>
              <dt className="faint">Cancellation</dt><dd className={`text-right font-medium ${room.refundable ? "text-ok" : ""}`}>{room.refundable ? "Free" : "Non-refundable"}</dd>
            </dl>
            {preview && (
              <div className="divider" />
            )}
            {preview && (
              <dl className="grid grid-cols-2 gap-1.5 text-sm tabular">
                <dt className="faint">{preview.nights} nights × {rooms} room{rooms > 1 ? "s" : ""}</dt><dd className="text-right">{formatMoney(preview.roomsSubtotal, preview.currency)}</dd>
                <dt className="faint">Length-of-stay discount</dt><dd className="text-right text-ok">{formatMoney(preview.lengthOfStayDiscount, preview.currency)}</dd>
                <dt className="faint">Taxes & fees</dt><dd className="text-right">{formatMoney(preview.taxesAndFees, preview.currency)}</dd>
                <dt className="font-semibold text-base pt-1">Total</dt><dd className="text-right font-semibold text-base pt-1">{formatMoney(preview.total, preview.currency)}</dd>
              </dl>
            )}
            <p className="text-xs faint">First night {start.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}. {loadBookings().length > 0 ? `You have ${loadBookings().length} booking${loadBookings().length > 1 ? "s" : ""} in this browser.` : ""}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
