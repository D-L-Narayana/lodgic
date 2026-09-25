import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import { CITIES, formatMoney, hotelPhotos, toSearchParams, type SearchHit, type SearchQuery } from "../lib/engine";
import { Img, Stars } from "./ui";

function FitBounds({ hits }: { hits: SearchHit[] }) {
  const map = useMap();
  useEffect(() => {
    if (hits.length === 0) return;
    const b = L.latLngBounds(hits.map((h) => [h.hotel.location.lat, h.hotel.location.lng] as [number, number]));
    map.fitBounds(b.pad(0.15), { animate: false });
  }, [hits, map]);
  return null;
}

export default function MapView({ hits, active, onActive, query }: { hits: SearchHit[]; active: string | null; onActive: (id: string | null) => void; query: SearchQuery }) {
  const city = CITIES.find((c) => c.name === query.city) ?? CITIES[0]!;
  const icons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const h of hits) {
      m.set(h.hotel.id, L.divIcon({ className: "", html: `<div class="price-pin ${active === h.hotel.id ? "active" : ""}">${formatMoney(h.quote.averageNightly, h.quote.currency).replace(/\.\d+$/, "")}</div>`, iconSize: [0, 0] }));
    }
    return m;
  }, [hits, active]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="card overflow-hidden h-[560px]">
        <MapContainer center={[city.centre.lat, city.centre.lng]} zoom={12} className="h-full w-full" scrollWheelZoom>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds hits={hits} />
          {hits.map((h) => (
            <Marker key={h.hotel.id} position={[h.hotel.location.lat, h.hotel.location.lng]} icon={icons.get(h.hotel.id)} eventHandlers={{ click: () => onActive(h.hotel.id), mouseover: () => onActive(h.hotel.id) }}>
              <Popup>
                <div className="grid gap-1 w-48">
                  <Img src={hotelPhotos(h.hotel.id, 1, 400)[0]!} alt="" className="h-24 rounded-md" />
                  <strong className="text-sm">{h.hotel.name}</strong>
                  <span className="text-xs">{h.hotel.rating.toFixed(1)}/10 · {h.hotel.distanceToCentreKm.toFixed(1)} km</span>
                  <Link to={`/hotel/${h.hotel.id}?${toSearchParams(query).toString()}`} className="text-xs font-semibold text-accent">See rooms →</Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <ol className="grid gap-2 max-h-[560px] overflow-auto pr-1">
        {hits.map((h, i) => (
          <li key={h.hotel.id}>
            <Link to={`/hotel/${h.hotel.id}?${toSearchParams(query).toString()}`} onMouseEnter={() => onActive(h.hotel.id)} onFocus={() => onActive(h.hotel.id)} className={`card p-3 flex gap-3 items-center hover-lift ${active === h.hotel.id ? "border-accent" : ""}`}>
              <Img src={hotelPhotos(h.hotel.id, 1, 200)[0]!} alt="" className="size-14 rounded-lg shrink-0" />
              <span className="grid min-w-0 flex-1">
                <span className="text-xs faint tabular">#{i + 1} <Stars n={h.hotel.stars} /></span>
                <span className="font-medium text-sm truncate">{h.hotel.name}</span>
                <span className="text-xs faint">{h.hotel.rating.toFixed(1)} · {h.hotel.distanceToCentreKm.toFixed(1)} km</span>
              </span>
              <span className="font-semibold tabular text-sm">{formatMoney(h.quote.total, h.quote.currency)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
