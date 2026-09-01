import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestedAt = new Map<string, number>();
const recentResults = new Map<
  string,
  { accepted: boolean; published: boolean; errors: string[] }
>();
const COOLDOWN_MS = 10_000;

export async function POST(request: NextRequest) {
  let market: string;
  try {
    const body = (await request.json()) as { market?: unknown };
    market = new PublicKey(String(body.market ?? "")).toBase58();
  } catch {
    return NextResponse.json({ error: "Invalid market" }, { status: 400 });
  }
  const now = Date.now();
  if (now - (requestedAt.get(market) ?? 0) < COOLDOWN_MS) {
    const previous = recentResults.get(market);
    return NextResponse.json(
      previous ? { ...previous, rateLimited: true } : { accepted: true, rateLimited: true },
      { status: 202 },
    );
  }
  requestedAt.set(market, now);

  const secret = process.env.ORACLE_REFRESH_SECRET?.trim();
  const publishers = [
    process.env.ORACLE_PRIMARY_URL?.trim(),
    process.env.ORACLE_BACKUP_URL?.trim(),
  ].filter((url): url is string => Boolean(url));
  if (!secret || publishers.length !== 2)
    return NextResponse.json({ error: "Oracle refresh is not configured" }, { status: 503 });

  let accepted = false;
  let published = false;
  const errors = new Set<string>();

  // A usable observation requires source zero to open a round and source one
  // to confirm it. Run two passes so refresh still completes when the Railway
  // primary/backup URLs are not in the same order as the immutable publishers.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const url of publishers) {
      try {
        const result = await fetch(`${url.replace(/\/+$/, "")}/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-oracle-refresh-secret": secret },
          body: JSON.stringify({ market }),
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        const body = (await result.json().catch(() => ({}))) as {
          error?: unknown;
          published?: unknown;
        };
        accepted ||= result.status === 202;
        published ||= body.published === true;
        if (!result.ok && typeof body.error === "string") errors.add(body.error);
      } catch (cause) {
        errors.add(cause instanceof Error ? cause.message : "Publisher request failed");
      }
    }
  }

  const response = { accepted, published, errors: [...errors] };
  recentResults.set(market, response);
  return NextResponse.json(response, { status: accepted ? 202 : 503 });
}
