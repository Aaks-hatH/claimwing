import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Svg, Polyline, Circle, Rect, Line } from "@react-pdf/renderer";
import { DateTime } from "luxon";
import type { ClaimContext } from "@/lib/claims";
import { formatDuration } from "@/lib/time";
import { formatMoney } from "@/lib/format";
import { ANGLE_LABELS } from "@/lib/format";
import { CAUSES } from "@/lib/rules/config";

export type PdfPhoto = { angle: string; stage: "before" | "after"; data: Buffer; takenAt: Date; exifTakenAt?: Date | null; sha256?: string | null; gps?: { lat: number; lon: number } | null; blurred: boolean };

const C = { ink: "#0a1e4a", muted: "#586a8e", line: "#d6e2f7", primary: "#0b63ff", soft: "#f4f8ff", warn: "#b45309", danger: "#b91c1c", ok: "#15803d" };

const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontFamily: "Helvetica", fontSize: 9.5, color: C.ink, lineHeight: 1.45 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 6, lineHeight: 1.25 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 4 },
  h3: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 4, marginTop: 8 },
  muted: { color: C.muted },
  small: { fontSize: 8, color: C.muted },
  box: { borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 10, marginBottom: 10 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 4 },
  k: { width: 140, color: C.muted },
  v: { flex: 1 },
  footerLeft: { position: "absolute", bottom: 24, left: 40, right: 120, fontSize: 7.5, color: C.muted },
  footerRight: { position: "absolute", bottom: 24, right: 40, fontSize: 7.5, color: C.muted, textAlign: "right" },
  badge: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, fontSize: 8, fontFamily: "Helvetica-Bold" },
  photoPair: { flexDirection: "row", gap: 8, marginBottom: 10 },
  photoCol: { flex: 1 },
});

const fmt = (d: Date | string | null | undefined, tz?: string | null) =>
  d ? DateTime.fromJSDate(new Date(d)).setZone(tz ?? "UTC").toFormat("d LLL yyyy, HH:mm ZZZZ") : "Not recorded";
const utc = (d: Date | string | null | undefined) => (d ? DateTime.fromJSDate(new Date(d)).toUTC().toFormat("yyyy-LL-dd HH:mm:ss 'UTC'") : "Not recorded");

function KV({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <View>
      {items.map(([k, v], i) => (
        <View key={i} style={s.row} wrap={false}>
          <Text style={s.k}>{k}</Text>
          <Text style={s.v}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function Footer({ ctx }: { ctx: NonNullable<ClaimContext> }) {
  return (
    <>
      <Text style={s.footerLeft} fixed>
        ClaimWing evidence packet · {ctx.trip.flightNumber} {ctx.trip.flightDate} · {ctx.trip.passengerName}
        {ctx.trip.demoMode ? " · DEMO REPLAY, NOT REAL DATA" : ""}
      </Text>
      <Text style={s.footerRight} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
    </>
  );
}

function statusStyle(status: string | undefined) {
  const color = status === "eligible" ? C.ok : status === "needs_review" ? C.warn : C.muted;
  return { ...s.badge, color, borderWidth: 1, borderColor: color };
}

/** Track drawn from position reports on a simple projection (no basemap needed, works offline). */
function TrackMap({ ctx }: { ctx: NonNullable<ClaimContext> }) {
  const o = ctx.origin;
  const d = ctx.destination;
  if (!o || !d) return null;
  const pts = ctx.track;
  const lats = [o.lat, d.lat, ...pts.map((p) => p.lat)];
  const lonsRaw = [o.lon, d.lon, ...pts.map((p) => p.lon)];
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const minLon = Math.min(...lonsRaw), maxLon = Math.max(...lonsRaw), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const W = 515, H = 220, pad = 18;
  const spanX = Math.max(0.5, (maxLon - minLon) * kx), spanY = Math.max(0.5, maxLat - minLat);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2;
  const X = (lon: number) => ox + (lon - minLon) * kx * scale;
  const Y = (lat: number) => H - (oy + (lat - minLat) * scale);
  const line = pts.map((p) => `${X(p.lon).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(" ");
  return (
    <View style={{ marginBottom: 8 }} wrap={false}>
      <View style={{ position: "relative", width: W, height: H }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={0} y={0} width={W} height={H} fill={C.soft} stroke={C.line} strokeWidth={1} />
        <Line x1={X(o.lon)} y1={Y(o.lat)} x2={X(d.lon)} y2={Y(d.lat)} stroke={C.muted} strokeWidth={0.8} strokeDasharray="3 4" />
        {pts.length > 1 && <Polyline points={line} stroke={C.primary} strokeWidth={2} fill="none" />}
        <Circle cx={X(o.lon)} cy={Y(o.lat)} r={4} fill="white" stroke={C.ink} strokeWidth={1.5} />
        <Circle cx={X(d.lon)} cy={Y(d.lat)} r={4} fill="white" stroke={C.ink} strokeWidth={1.5} />
      </Svg>
      {[o, d].map((a) => (
        <Text
          key={a.iata}
          style={{ position: "absolute", left: Math.min(W - 30, Math.max(2, X(a.lon) - 12)), top: Math.max(2, Y(a.lat) - 16), fontSize: 8, fontFamily: "Helvetica-Bold" }}
        >
          {a.iata}
        </Text>
      ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
        <Text style={s.small}>
          {o.iata} → {d.iata}. Blue: {pts.length} recorded aircraft positions. Dashed: direct route. Simplified projection, no basemap.
        </Text>
      </View>
    </View>
  );
}

function PhotoWithMarkers({ photo, markers }: { photo: PdfPhoto; markers: Array<{ rect: { x: number; y: number; w: number; h: number }; note: string }> }) {
  const W = 250, H = 188;
  return (
    <View style={{ width: W, height: H, position: "relative", borderWidth: 1, borderColor: C.line }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={{ data: photo.data, format: "jpg" }} style={{ width: W - 2, height: H - 2, objectFit: "contain" }} />
      {markers.map((m, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: m.rect.x * (W - 2),
            top: m.rect.y * (H - 2),
            width: m.rect.w * (W - 2),
            height: m.rect.h * (H - 2),
            borderWidth: 2,
            borderColor: C.danger,
          }}
        >
          <Text style={{ position: "absolute", top: -11, left: 0, fontSize: 7, color: "white", backgroundColor: C.danger, paddingHorizontal: 2 }}>{i + 1}</Text>
        </View>
      ))}
    </View>
  );
}

export function ClaimDocument({ ctx, photos, letter, generatedAt }: { ctx: NonNullable<ClaimContext>; photos: Map<string, PdfPhoto[]>; letter: string; generatedAt: Date }) {
  const t = ctx.trip;
  const e = ctx.eligibility;
  const p = e?.primary;
  const out = ctx.outcome;
  const tzO = ctx.origin?.tz;
  const tzD = ctx.destination?.tz;

  return (
    <Document title={`ClaimWing evidence ${t.flightNumber} ${t.flightDate}`} author={t.passengerName} creator="ClaimWing" producer="ClaimWing">
      {/* ---------- Cover ---------- */}
      <Page size="A4" style={s.page}>
        <Text style={[s.small, { marginBottom: 18, color: C.primary, fontFamily: "Helvetica-Bold" }]}>CLAIMWING · EVIDENCE PACKET</Text>
        <Text style={s.h1}>
          {ctx.includeFlight && ctx.includeBags ? "Flight and baggage claim" : ctx.includeBags ? "Baggage claim" : "Flight disruption claim"}
        </Text>
        <Text style={[s.muted, { marginBottom: 16 }]}>
          {t.flightNumber} · {ctx.airlineName} · {ctx.origin?.name ?? t.origin} ({t.origin}) to {ctx.destination?.name ?? t.destination} ({t.destination})
        </Text>
        {t.demoMode && (
          <View style={[s.box, { borderColor: C.warn }]}>
            <Text style={{ color: C.warn, fontFamily: "Helvetica-Bold" }}>Demo replay: this packet is built from a stored demonstration flight, not live data. Do not submit it.</Text>
          </View>
        )}
        <View style={s.box}>
          <KV
            items={[
              ["Passenger", t.passengerName],
              ["Contact", ctx.user.email],
              ["Booking reference", t.bookingRef || "Not entered"],
              ["Flight date", t.flightDate],
              ["Scheduled departure", fmt(t.scheduledDeparture, tzO)],
              ["Scheduled arrival", fmt(t.scheduledArrival, tzD)],
              ...(ctx.includeFlight
                ? ([
                    ["Actual arrival", out?.actualArrival ? `${fmt(out.actualArrival, tzD)} (${out.delaySource})` : "Not recorded"],
                    ["Arrival delay", out?.delayMinutes != null ? formatDuration(out.delayMinutes) : "Not recorded"],
                  ] as Array<[string, string]>)
                : []),
            ]}
          />
        </View>
        {p && (
          <View style={s.box}>
            <Text style={s.h3}>Eligibility estimate</Text>
            <Text style={statusStyle(p.status)}>{p.status === "eligible" ? "LIKELY ELIGIBLE" : p.status === "needs_review" ? "NEEDS REVIEW" : "NOT ELIGIBLE"}</Text>
            <Text style={{ marginTop: 6 }}>{e?.summary}</Text>
            <Text style={[s.small, { marginTop: 4 }]}>
              Rule applied: {p.regimeName}, {p.ruleApplied}.
            </Text>
          </View>
        )}
        {ctx.bags.map((b) => (
          <View key={String(b.bag._id)} style={s.box}>
            <Text style={s.h3}>Bag: {b.bag.description}</Text>
            <Text>
              Status: {b.bag.status.replace("_", " ")}
              {b.bag.tagNumber ? ` · Tag ${b.bag.tagNumber}` : ""}
              {b.bag.pirReference ? ` · Report ${b.bag.pirReference}` : ""}
            </Text>
            {b.eligibility?.deadlines
              .filter((d) => d.kind !== "limitation")
              .map((d) => (
                <Text key={d.kind} style={s.small}>
                  {d.label}: by {fmt(d.dueAt, tzD)} ({d.basis})
                </Text>
              ))}
          </View>
        ))}
        <Text style={[s.small, { marginTop: 10 }]}>
          Generated {utc(generatedAt)}. ClaimWing is a documentation tool, not legal advice. Eligibility is an automated estimate from the facts recorded; the airline or a court may decide differently.
        </Text>
        <Footer ctx={ctx} />
      </Page>

      {/* ---------- Flight evidence ---------- */}
      {ctx.includeFlight && (
        <Page size="A4" style={s.page}>
          <Text style={s.h2}>1. Flight evidence</Text>
          {ctx.track.length > 0 && <TrackMap ctx={ctx} />}
          <Text style={s.h3}>Delay calculation</Text>
          <KV
            items={[
              ["Scheduled arrival", `${fmt(t.scheduledArrival, tzD)} · ${utc(t.scheduledArrival)}`],
              ["Actual arrival used", out?.actualArrival ? `${fmt(out.actualArrival, tzD)} · ${utc(out.actualArrival)}` : "Not recorded"],
              ["Source of that time", out?.delaySource ?? "Not recorded"],
              ["Arrival delay", out?.delayMinutes != null ? `${formatDuration(out.delayMinutes)} (${out.delayMinutes} minutes)` : "Not recorded"],
              ["Disruption", out?.disruption ?? "delay"],
              ["Reason given", `${CAUSES[(out?.cause ?? "unknown") as keyof typeof CAUSES]?.label ?? "Unknown"}${out?.causeNote ? ` (${out.causeNote})` : ""}`],
            ]}
          />
          <Text style={[s.small, { marginTop: 4 }]}>
            Legally, arrival is when at least one door opens (CJEU, Germanwings C-452/13). Runway and ADS-B times are earlier than that, which is why each time below names its source.
          </Text>

          <Text style={s.h3}>All recorded times</Text>
          {ctx.evidence.length === 0 ? (
            <Text style={s.muted}>No times were recorded.</Text>
          ) : (
            ctx.evidence.map((ev, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={{ width: 120 }}>{utc(ev.time)}</Text>
                <Text style={{ width: 150, fontFamily: "Helvetica-Bold" }}>{ev.label}</Text>
                <Text style={{ flex: 1, color: C.muted }}>
                  {ev.source}
                  {ev.note ? `: ${ev.note}` : ""}
                </Text>
              </View>
            ))
          )}

          {ctx.weather && (
            <>
              <Text style={s.h3}>Weather context</Text>
              {[ctx.weather.departure, ctx.weather.arrival].filter(Boolean).map((w, i) => (
                <Text key={i} style={{ marginBottom: 3 }}>
                  {w!.summary} <Text style={s.small}>({w!.source})</Text>
                </Text>
              ))}
              <Text style={s.small}>Weather model data, not an official airport observation.</Text>
            </>
          )}

          {e && (
            <>
              <Text style={s.h3}>Eligibility reasoning</Text>
              {e.results
                .filter((r) => r.applies)
                .map((r) => (
                  <View key={r.regime} style={[s.box, { marginTop: 4 }]} wrap={false}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>
                      {r.regimeName}: {r.status.replace("_", " ")}
                      {r.amount && r.currency ? ` · ${r.minAmount ? `${formatMoney(r.minAmount, r.currency)}–` : ""}${formatMoney(r.amount, r.currency)}` : ""}
                    </Text>
                    {r.explanation.map((x, i) => (
                      <Text key={i} style={{ marginTop: 2 }}>
                        • {x}
                      </Text>
                    ))}
                    <Text style={[s.small, { marginTop: 4 }]}>Sources: {r.citations.map((c) => c.label).join("; ")}</Text>
                  </View>
                ))}
              <Text style={s.small}>Great-circle distance {Math.round(e.distanceKm).toLocaleString("en")} km.</Text>
            </>
          )}
          <Footer ctx={ctx} />
        </Page>
      )}

      {/* ---------- Baggage evidence ---------- */}
      {ctx.bags.map((b, bi) => {
        const list = photos.get(String(b.bag._id)) ?? [];
        const angles = [...new Set(list.map((x) => x.angle))];
        return (
          <Page key={String(b.bag._id)} size="A4" style={s.page}>
            <Text style={s.h2}>
              {ctx.includeFlight ? 2 + bi : 1 + bi}. Baggage evidence: {b.bag.description}
            </Text>
            <Text style={[s.small, { marginBottom: 8 }]}>
              Before photos were taken at check-in and after photos at baggage claim. They show the condition of the bag at those two moments; they do not prove who caused any damage. Red boxes are damage the passenger marked and confirmed.
            </Text>
            {angles.length === 0 && <Text style={s.muted}>No photos recorded for this bag.</Text>}
            {angles.map((angle) => {
              const before = list.find((x) => x.angle === angle && x.stage === "before");
              const after = list.find((x) => x.angle === angle && x.stage === "after");
              const marks = b.markers.filter((m) => m.angle === angle);
              return (
                <View key={angle} wrap={false} style={{ marginBottom: 10 }}>
                  <Text style={s.h3}>{ANGLE_LABELS[angle]?.label ?? angle}</Text>
                  <View style={s.photoPair}>
                    {[before, after].map((ph, i) => (
                      <View key={i} style={s.photoCol}>
                        <Text style={[s.small, { fontFamily: "Helvetica-Bold" }]}>{i === 0 ? "BEFORE (check-in)" : "AFTER (arrival)"}</Text>
                        {ph ? (
                          <>
                            <PhotoWithMarkers photo={ph} markers={i === 1 ? marks : []} />
                            <Text style={s.small}>
                              Taken {utc(ph.takenAt)}
                              {ph.exifTakenAt ? ` · camera clock ${utc(ph.exifTakenAt)}` : ""}
                              {ph.gps ? ` · ${ph.gps.lat.toFixed(4)}, ${ph.gps.lon.toFixed(4)}` : ""}
                              {ph.blurred ? " · partly blurred for privacy" : ""}
                            </Text>
                            {ph.sha256 && <Text style={s.small}>SHA-256 of original: {ph.sha256.slice(0, 32)}…</Text>}
                          </>
                        ) : (
                          <Text style={s.muted}>Not taken</Text>
                        )}
                      </View>
                    ))}
                  </View>
                  {marks.map((m, i) => (
                    <Text key={i}>
                      {i + 1}. {m.note || "Damage marked by passenger"}
                    </Text>
                  ))}
                </View>
              );
            })}
            <Text style={s.h3}>Bag details</Text>
            <KV
              items={[
                ["Contents", b.bag.contentsCategory],
                ["Estimated value", b.bag.estimatedValue?.amount != null ? formatMoney(b.bag.estimatedValue.amount, b.bag.estimatedValue.currency ?? "USD") : "Not entered"],
                ["Received", fmt(b.bag.receivedAt, tzD)],
                ["Reported missing", fmt(b.bag.reportedMissingAt, tzD)],
                ["Delivered", fmt(b.bag.deliveredAt, tzD)],
                ["Receipts enclosed", String(b.bag.receipts?.length ?? 0)],
                [
                  "Liability limit",
                  b.eligibility ? `${b.eligibility.limitSdr.toLocaleString("en")} SDR${b.eligibility.limitLocal ? ` (about ${b.eligibility.limitLocal.toLocaleString("en")} ${b.eligibility.limitCurrency ?? ""})` : ""}` : "Not available",
                ],
              ]}
            />
            <Footer ctx={ctx} />
          </Page>
        );
      })}

      {/* ---------- Letter ---------- */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Claim letter</Text>
        {letter.split("\n").map((line, i) => (
          <Text key={i} style={{ minHeight: 10 }}>
            {line}
          </Text>
        ))}
        <Footer ctx={ctx} />
      </Page>

      {/* ---------- Appendix ---------- */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Appendix: data sources</Text>
        <KV
          items={[
            ["Packet generated", utc(generatedAt)],
            ["Scheduled times", "Entered by the passenger from the booking (or looked up from the schedule source below)"],
            ...(ctx.trackStats
              ? ([
                  ["Aircraft positions", `${ctx.trackStats.count} reports from ${ctx.trackStats.sources.join(", ")}`],
                  ["First / last position", `${utc(ctx.trackStats.first)} / ${utc(ctx.trackStats.last)}`],
                ] as Array<[string, string]>)
              : []),
            ...ctx.evidence.map((ev) => [`${ev.label}`, `${ev.source}, recorded ${utc(ev.recordedAt)}`] as [string, string]),
            ...(ctx.weather ? ([["Weather", [ctx.weather.departure?.sourceUrl, ctx.weather.arrival?.sourceUrl].filter(Boolean).join(" ")]] as Array<[string, string]>) : []),
            ["Regulation text", [...new Set((e?.results ?? []).filter((r) => r.applies).flatMap((r) => r.citations.map((c) => c.url).filter(Boolean)))].join(" ") || "None"],
          ]}
        />
        <Text style={[s.small, { marginTop: 10 }]}>
          ADS-B data is broadcast by the aircraft and collected by volunteer receiver networks (airplanes.live, OpenSky Network). Coverage can be incomplete at low altitude. Photo hashes let anyone check that the original image files supplied with this packet have not been altered.
        </Text>
        <Footer ctx={ctx} />
      </Page>
    </Document>
  );
}
