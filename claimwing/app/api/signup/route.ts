import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/models";
import { errorResponse, HttpError, ok, parseJson } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/ratelimit";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email").max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200)
    .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Use letters and at least one number"),
});

export async function POST(req: Request) {
  try {
    const limit = await rateLimit("signup", clientIp(req), 10, 60 * 60);
    if (!limit.ok) throw new HttpError(429, "Too many sign-ups from this network. Try again later.");
    const body = await parseJson(req, schema);
    await connectDB();
    const email = body.email.toLowerCase();
    const existing = await User.findOne({ email }).select("+passwordHash provider").lean();
    if (existing) {
      throw new HttpError(
        409,
        existing.passwordHash
          ? "An account with this email already exists. Sign in instead."
          : "This email uses Google sign-in. Continue with Google instead.",
      );
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    await User.create({ name: body.name, email, passwordHash, provider: "credentials" });
    return ok({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
