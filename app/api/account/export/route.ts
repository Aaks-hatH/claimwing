import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { BaggageItem, BaggagePhoto, Claim, DamageMarker, FlightOutcome, FlightReport, FlightSnapshot, Notification, Trip, User } from "@/models";

/** All of the user's records as JSON (photos are referenced by their download URLs). */
export const GET = withUser(
  async (_req, { user }) => {
    await connectDB();
    const q = { userId: user.oid };
    const [profile, trips, outcomes, snapshots, bags, photos, markers, claims, notifications, flightReports] = await Promise.all([
      User.findById(user.oid).select("-passwordHash").lean(),
      Trip.find(q).lean(),
      FlightOutcome.find(q).lean(),
      FlightSnapshot.find(q).select("-raw").lean(),
      BaggageItem.find(q).lean(),
      BaggagePhoto.find(q).lean(),
      DamageMarker.find(q).lean(),
      Claim.find(q).lean(),
      Notification.find(q).lean(),
      FlightReport.find(q).select("-contributor").lean(),
    ]);
    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        note: "Photo and receipt files can be downloaded while signed in from the URLs in 'files'.",
        profile,
        trips,
        outcomes,
        snapshots,
        bags,
        flightReports,
        photos,
        markers,
        claims,
        notifications,
        files: [
          ...photos.flatMap((p) => [`/api/uploads/${p.storageKey}?download=1`]),
          ...bags.flatMap((b) => (b.receipts ?? []).map((r) => `/api/uploads/${r.storageKey}?download=1`)),
        ],
      },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="claimwing-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { rateLimit: { name: "export", limit: 10, windowSeconds: 3600 } },
);
