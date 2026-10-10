import { ok, withUser } from "@/lib/api";
import { modelCard } from "@/lib/ripple/model";

/** What the trained model is, what it covers, and how it scored on held-out data. */
export const GET = withUser(async () => ok(await modelCard()));
