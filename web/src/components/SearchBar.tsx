import { CalendarDays, MapPin, Minus, Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { useNavigate } from "react-router-dom";
import { CITIES, addDays, fmtDate, nightsBetween, today, toSearchParams, type SearchQuery } from "../lib/engine";

interface Props {
  initial?: Partial<SearchQuery>;
  compact?: boolean;
  onSearch?: (q: Partial<SearchQuery>) => void;
}

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00`);
const toIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function SearchBar({ initial = {}, compact = false, onSearch }: Props) {
  const navigate = useNavigate();
  const [city, setCity] = useState(initial.city ?? "");
  const [checkIn, setCheckIn] = useState(initial.checkIn ?? addDays(today, 14));
  const [checkOut, setCheckOut] = useState(initial.checkOut ?? addDays(today, 17));
  const [guests, setGuests] = useState(initial.guests ?? 2);
  const [rooms, setRooms] = useState(initial.rooms ?? 1);
  const [open, setOpen] = useState<"city" | "dates" | "guests" | null>(null);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const suggestions = useMemo(() => {
    const q = city.trim().toLowerCase();
    const list = CITIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
    return (q ? list : [...CITIES].sort((a, b) => a.name.localeCompare(b.name))).slice(0, 8);
  }, [city]);

  const validCity = CITIES.some((c) => c.name.toLowerCase() === city.trim().toLowerCase());
  const nights = Math.max(0, nightsBetween(checkIn, checkOut));

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const chosen = CITIES.find((c) => c.name.toLowerCase() === city.trim().toLowerCase()) ?? suggestions[0];
    if (!chosen) return;
    const q: Partial<SearchQuery> = { city: chosen.name, checkIn, checkOut, guests, rooms, ...(initial.sort ? { sort: initial.sort } : {}), ...(initial.currency ? { currency: initial.currency } : {}), ...(initial.traveller ? { traveller: initial.traveller } : {}) };
    setOpen(null);
    onSearch?.(q);
    navigate(`/search?${toSearchParams(q).toString()}`);
  }

  const range: DateRange = { from: toDate(checkIn), to: toDate(checkOut) };
  const field = `relative flex items-center gap-3 px-4 ${compact ? "h-12" : "h-14"} rounded-xl border border-line bg-card text-left hover:border-ink3 transition-colors w-full`;

  return (
    <form ref={wrap} onSubmit={submit} role="search" aria-label="Hotel search" className={`grid gap-2 ${compact ? "lg:grid-cols-[1.4fr_1.3fr_1fr_auto]" : "lg:grid-cols-[1.4fr_1.3fr_1fr_auto]"} card p-2 ${compact ? "" : "shadow-float"}`}>
      {/* Destination */}
      <div className="relative">
        <label className={field} onClick={() => setOpen("city")}>
          <MapPin size={18} className="text-accent shrink-0" />
          <span className="grid text-left flex-1 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">Destination</span>
            <input
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setOpen("city");
                setHi(0);
              }}
              onFocus={() => setOpen("city")}
              onKeyDown={(e) => {
                if (open !== "city") return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHi((h) => Math.min(h + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHi((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter" && suggestions[hi]) {
                  e.preventDefault();
                  setCity(suggestions[hi]!.name);
                  setOpen("dates");
                }
              }}
              placeholder="Where to?"
              className="bg-transparent outline-none w-full text-[15px] font-medium placeholder:text-ink3 truncate"
              role="combobox"
              aria-expanded={open === "city"}
              aria-controls="city-listbox"
              aria-autocomplete="list"
              autoComplete="off"
            />
          </span>
        </label>
        {open === "city" && (
          <ul id="city-listbox" role="listbox" className="absolute z-50 top-full mt-2 left-0 w-full min-w-64 card p-1.5 max-h-80 overflow-auto fade-in">
            {suggestions.length === 0 && <li className="px-3 py-3 text-sm muted">No cities match “{city}”. Try Goa, Paris or Tokyo.</li>}
            {suggestions.map((c, i) => (
              <li key={c.name} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => {
                    setCity(c.name);
                    setOpen("dates");
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm ${i === hi ? "bg-accent-soft" : "hover:bg-bg2"}`}
                >
                  <span className="grid place-items-center size-8 rounded-md bg-bg2 text-ink2">
                    <MapPin size={14} />
                  </span>
                  <span className="grid">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs faint">{c.country} · prices in {c.currency}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dates */}
      <div className="relative">
        <button type="button" className={field} onClick={() => setOpen(open === "dates" ? null : "dates")} aria-haspopup="dialog" aria-expanded={open === "dates"}>
          <CalendarDays size={18} className="text-accent shrink-0" />
          <span className="grid text-left">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">Dates</span>
            <span className="text-[15px] font-medium">
              {fmtDate(checkIn)} → {fmtDate(checkOut)} <span className="faint font-normal">· {nights} night{nights === 1 ? "" : "s"}</span>
            </span>
          </span>
        </button>
        {open === "dates" && (
          <div role="dialog" aria-label="Choose dates" className="absolute z-50 top-full mt-2 left-0 card p-3 fade-in max-w-[calc(100vw-2rem)] overflow-auto">
            <DayPicker
              mode="range"
              numberOfMonths={typeof window !== "undefined" && window.innerWidth < 720 ? 1 : 2}
              selected={range}
              defaultMonth={range.from}
              disabled={{ before: toDate(today) }}
              max={30}
              onSelect={(r) => {
                if (!r?.from) return;
                const from = toIso(r.from);
                const to = r.to ? toIso(r.to) : addDays(from, 1);
                setCheckIn(from);
                setCheckOut(to === from ? addDays(from, 1) : to);
                if (r.to && r.to.getTime() !== r.from.getTime()) setOpen("guests");
              }}
            />
            <div className="flex justify-between items-center px-1 pt-2 border-t border-line text-xs muted">
              <span>Up to 30 nights · peak season Oct–Feb costs more</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen("guests")}>Done</button>
            </div>
          </div>
        )}
      </div>

      {/* Guests */}
      <div className="relative">
        <button type="button" className={field} onClick={() => setOpen(open === "guests" ? null : "guests")} aria-haspopup="dialog" aria-expanded={open === "guests"}>
          <Users size={18} className="text-accent shrink-0" />
          <span className="grid text-left">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">Guests</span>
            <span className="text-[15px] font-medium">
              {guests} guest{guests === 1 ? "" : "s"} <span className="faint font-normal">· {rooms} room{rooms === 1 ? "" : "s"}</span>
            </span>
          </span>
        </button>
        {open === "guests" && (
          <div role="dialog" aria-label="Guests and rooms" className="absolute z-50 top-full mt-2 right-0 card p-4 w-72 grid gap-4 fade-in">
            {[
              { label: "Guests", hint: "Ages 12+", v: guests, set: setGuests, min: 1, max: 16 },
              { label: "Rooms", hint: "Same room type", v: rooms, set: setRooms, min: 1, max: 8 },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="grid">
                  <span className="font-medium text-sm">{row.label}</span>
                  <span className="text-xs faint">{row.hint}</span>
                </span>
                <span className="inline-flex items-center gap-3">
                  <button type="button" className="btn btn-ghost btn-sm w-9 px-0" onClick={() => row.set(Math.max(row.min, row.v - 1))} disabled={row.v <= row.min} aria-label={`Fewer ${row.label.toLowerCase()}`}>
                    <Minus size={14} />
                  </button>
                  <span className="w-5 text-center tabular font-semibold">{row.v}</span>
                  <button type="button" className="btn btn-ghost btn-sm w-9 px-0" onClick={() => row.set(Math.min(row.max, row.v + 1))} disabled={row.v >= row.max} aria-label={`More ${row.label.toLowerCase()}`}>
                    <Plus size={14} />
                  </button>
                </span>
              </div>
            ))}
            {guests > rooms * 4 && <p className="text-xs text-coral">Our largest rooms sleep 4 — add a room to fit {guests} guests.</p>}
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setOpen(null)}>Done</button>
          </div>
        )}
      </div>

      <button type="submit" className={`btn btn-primary ${compact ? "h-12" : "h-14"} px-6`} disabled={!validCity && suggestions.length === 0}>
        <Search size={18} /> Search
      </button>
    </form>
  );
}
