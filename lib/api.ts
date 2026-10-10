import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getCurrentUser, type CurrentUser } from "./session";
import { rateLimit } from "./ratelimit";
import { isObjectId } from "./utils";

import { HttpError } from "./errors";

export { HttpError };

export const notFound = (what = "Not found") => new HttpError(404, what);

type RouteCtx<P> = { params: Promise<P> };

type Options = {
  /** Requests per window per user. */
  rateLimit?: { name: string; limit: number; windowSeconds: number };
};

/**
 * Wraps a route handler: requires a signed-in user, applies rate limits,
 * and turns thrown errors into consistent JSON responses.
 */
export function withUser<P = Record<string, string>>(
  fn: (req: Request, ctx: { params: P; user: CurrentUser }) => Promise<Response>,
  options: Options = {},
) {
  return async (req: Request, ctx: RouteCtx<P>) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new HttpError(401, "Please sign in.");
      if (options.rateLimit) {
        const { name, limit, windowSeconds } = options.rateLimit;
        const r = await rateLimit(name, user.id, limit, windowSeconds);
        if (!r.ok) {
          return NextResponse.json(
            { error: "Too many requests. Please wait a moment and try again." },
            { status: 429, headers: { "Retry-After": String(r.retryAfter) } },
          );
        }
      }
      const params = (await ctx.params) ?? ({} as P);
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        if (k.toLowerCase().endsWith("id") && !isObjectId(v)) throw notFound();
      }
      return await fn(req, { params, user });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Some fields are invalid.", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  return schema.parse(body);
}

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
