"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { useTheme } from "next-themes";

export type TrackPoint = { t: string; lat: number; lon: number; alt: number | null; gs: number | null; trk: number | null; gnd: boolean };
type Airport = { iata: string; lat: number; lon: number; name: string };

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.basemaps.cartocdn.com/{theme}_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Intermediate points on the great circle, so the planned route curves like a real flight path. */
function greatCircle(a: Airport, b: Airport, n = 64): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat), λ1 = toRad(a.lon), φ2 = toRad(b.lat), λ2 = toRad(b.lon);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return [[a.lat, a.lon]];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    pts.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  // Keep longitudes continuous across the antimeridian so the line doesn't wrap the globe.
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][1] - pts[i - 1][1] > 180) pts[i][1] -= 360;
    while (pts[i][1] - pts[i - 1][1] < -180) pts[i][1] += 360;
  }
  return pts;
}

const COLORS = {
  light: { primary: "#1e252d", muted: "#56606b", fg: "#1e252d", bg: "#ffffff" },
  dark: { primary: "#ffcd00", muted: "#9ba5b0", fg: "#e8ebee", bg: "#12171c" },
};

function planeIcon(rotation: number, color: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="transform: rotate(${rotation}deg); width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="${color}" stroke="white" stroke-width="1" d="M12 2c.7 0 1.2.6 1.2 1.3v5.9l7.3 4.3v2l-7.3-2.2v4.4l2 1.6v1.6L12 20l-3.2 1v-1.6l2-1.6v-4.4L3.5 15.5v-2l7.3-4.3V3.3C10.8 2.6 11.3 2 12 2Z"/></svg>
    </div>`,
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.length ? `${points[0]}${points[points.length - 1]}` : "";
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [28, 28] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function FlightMap({ origin, destination, track, label }: { origin: Airport; destination: Airport; track: TrackPoint[]; label: string }) {
  const { resolvedTheme } = useTheme();
  const planned = useMemo(() => greatCircle(origin, destination), [origin, destination]);
  const line = useMemo(() => {
    const pts: [number, number][] = track.map((p) => [p.lat, p.lon]);
    for (let i = 1; i < pts.length; i++) {
      while (pts[i][1] - pts[i - 1][1] > 180) pts[i][1] -= 360;
      while (pts[i][1] - pts[i - 1][1] < -180) pts[i][1] += 360;
    }
    return pts;
  }, [track]);
  const last = track[track.length - 1];
  const url = TILE_URL.replace("{theme}", resolvedTheme === "dark" ? "dark" : "light");
  const c = COLORS[resolvedTheme === "dark" ? "dark" : "light"];

  return (
    <MapContainer
      center={[(origin.lat + destination.lat) / 2, (origin.lon + destination.lon) / 2]}
      zoom={3}
      scrollWheelZoom={false}
      worldCopyJump
      className="h-full w-full"
      attributionControl
    >
      <TileLayer url={url} attribution={ATTRIBUTION} />
      <FitBounds points={planned} />
      <Polyline positions={planned} pathOptions={{ color: c.muted, weight: 1.5, dashArray: "4 6", opacity: 0.8 }} />
      {line.length > 1 && <Polyline positions={line} pathOptions={{ color: c.primary, weight: 3 }} />}
      {[origin, destination].map((a) => (
        <CircleMarker key={a.iata} center={[a.lat, a.lon]} radius={5} pathOptions={{ color: c.fg, fillColor: c.bg, fillOpacity: 1, weight: 2 }}>
          <Tooltip direction="top" offset={[0, -4]} permanent className="!rounded-md !border !px-1.5 !py-0.5 !text-[11px] !font-semibold">
            {a.iata}
          </Tooltip>
        </CircleMarker>
      ))}
      {last && (
        <Marker position={[last.lat, line[line.length - 1]?.[1] ?? last.lon]} icon={planeIcon(last.trk ?? 0, c.primary)} alt={`${label} current position`}>
          <Tooltip direction="right" offset={[12, 0]}>{label}</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
