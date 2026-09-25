import { CalendarCheck, Download, PartyPopper, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, Img } from "../components/ui";
import { engine, fmtDate, formatMoney, loadBookings, updateStoredBooking, type StoredBooking } from "../lib/engine";

const STATUS: Record<string, { label: string; cls: string }> = {
  HELD: { label: "Held — awaiting payment", cls: "chip-coral" },
  CONFIRMED: { label: "Confirmed", cls: "chip-ok" },
  CANCELLED: { label: "Cancelled", cls: "" },
  EXPIRED: { label: "Hold expired", cls: "" },
};

function icsFor(b: StoredBooking): string {
  const r = b.reservation;
  const d = (iso: string) => iso.replace(/-/g, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lodgic//EN", "BEGIN:VEVENT", `UID:${r.id}@lodgic`, `DTSTART;VALUE=DATE:${d(r.checkIn)}`, `DTEND;VALUE=DATE:${d(r.checkOut)}`, `SUMMARY:${b.hotelName} — ${b.roomName}`, `LOCATION:${b.city}`, `DESCRIPTION:Reservation ${r.id} · ${formatMoney(r.quote.total, r.quote.currency)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

export function Confirmation() {
  const { id = "" } = useParams();
  const b = loadBookings().find((x) => x.reservation.id === id);
  useEffect(() => {
    document.title = "Booking confirmed — Lodgic";
  }, []);
  if (!b) {
    return (
      <div className="container-x py-10">
        <EmptyState title="No such booking in this browser" body="Bookings are stored locally in this demo. Make a new one to see the confirmation page." action={<Link to="/" className="btn btn-primary btn-sm">Search stays</Link>} />
      </div>
    );
  }
  const r = engine.reservations.get(id) ?? b.reservation;
  return (
    <div className="container-x py-10 max-w-3xl">
      <div className="card overflow-hidden pop">
        <div className="bg-accent text-accent-ink p-6 flex items-center gap-4">
          <span className="grid place-items-center size-12 rounded-full bg-white/15"><PartyPopper size={24} /></span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Booking confirmed</span>
            <h1 className="text-2xl leading-tight">You're going to {b.city}!</h1>
          </div>
        </div>
        <div className="grid sm:grid-cols-[200px_1fr]">
          <Img src={b.photo} alt="" className="h-40 sm:h-full" />
          <div className="p-6 grid gap-4">
            <div>
              <h2 className="text-lg">{b.hotelName}</h2>
              <p className="text-sm faint">{b.roomName} · {r.rooms} room{r.rooms > 1 ? "s" : ""} · {r.guests} guest{r.guests > 1 ? "s" : ""}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><dt className="faint">Check-in</dt><dd className="font-medium">{fmtDate(r.checkIn, { weekday: "short", day: "numeric", month: "long" })}</dd></div>
              <div><dt className="faint">Check-out</dt><dd className="font-medium">{fmtDate(r.checkOut, { weekday: "short", day: "numeric", month: "long" })}</dd></div>
              <div><dt className="faint">Guest</dt><dd className="font-medium">{r.guest.name}</dd></div>
              <div><dt className="faint">Total paid</dt><dd className="font-medium tabular">{formatMoney(r.quote.total, r.quote.currency)}</dd></div>
              <div><dt className="faint">Reservation</dt><dd className="font-medium tabular">{r.id}</dd></div>
              <div><dt className="faint">Payment</dt><dd className="font-medium tabular">{r.paymentIntentId ?? "—"}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-soft btn-sm" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(b))}`} download={`lodgic-${r.id}.ics`}>
                <Download size={14} /> Add to calendar
              </a>
              <Link to="/bookings" className="btn btn-ghost btn-sm"><Ticket size={14} /> My bookings</Link>
              <Link to="/" className="btn btn-ghost btn-sm">Book another stay</Link>
            </div>
            <p className="text-xs faint">A confirmation would normally be emailed to {r.guest.email}. This is a demo — no email is sent and no money moved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Bookings() {
  const [list, setList] = useState<StoredBooking[]>(() => loadBookings());
  useEffect(() => {
    document.title = "My bookings — Lodgic";
  }, []);

  function cancel(b: StoredBooking) {
    try {
      const r = engine.reservations.cancel(b.reservation.id);
      updateStoredBooking(r);
    } catch {
      // The engine restarts with every page load, so older bookings only exist in storage: mark them cancelled locally.
      updateStoredBooking({ ...b.reservation, status: "CANCELLED", cancelledAt: Date.now() });
    }
    setList(loadBookings());
  }

  return (
    <div className="container-x py-8">
      <div className="mb-6">
        <span className="eyebrow">Trips</span>
        <h1 className="text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)] mt-1">My bookings</h1>
        <p className="muted text-sm">Stored in this browser. Cancelling a confirmed stay refunds the payment and releases the room instantly.</p>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No trips yet" body="When you reserve a room it shows up here with its status, price breakdown and a calendar file." action={<Link to="/" className="btn btn-primary btn-sm"><CalendarCheck size={14} /> Find a stay</Link>} />
      ) : (
        <ul className="grid gap-4">
          {list.map((b, i) => {
            const r = engine.reservations.get(b.reservation.id) ?? b.reservation;
            const st = STATUS[r.status] ?? STATUS.CANCELLED!;
            return (
              <li key={r.id} className={`card overflow-hidden grid sm:grid-cols-[200px_1fr] rise`} style={{ animationDelay: `${i * 50}ms` }}>
                <Img src={b.photo} alt="" className="h-36 sm:h-full" />
                <div className="p-5 grid gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg leading-tight">{b.hotelName}</h2>
                      <p className="text-sm faint">{b.city} · {b.roomName} · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} · {r.guests} guest{r.guests > 1 ? "s" : ""}</p>
                    </div>
                    <span className={`chip ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="tabular text-sm"><span className="faint">Total</span> <strong>{formatMoney(r.quote.total, r.quote.currency)}</strong> <span className="faint">· {r.id}</span></span>
                    <span className="flex gap-2">
                      {r.status === "CONFIRMED" && <Link to={`/confirmation/${r.id}`} className="btn btn-ghost btn-sm">View</Link>}
                      {(r.status === "CONFIRMED" || r.status === "HELD") && (
                        <button type="button" className="btn btn-ghost btn-sm text-coral" onClick={() => cancel(b)}>
                          {r.status === "CONFIRMED" ? "Cancel & refund" : "Release hold"}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
