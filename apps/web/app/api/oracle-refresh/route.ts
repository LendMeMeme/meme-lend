import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestedAt = new Map<string, number>();
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
  if (now - (requestedAt.get(market) ?? 0) < COOLDOWN_MS)
    return NextResponse.json({ accepted: true, rateLimited: true }, { status: 202 });
  requestedAt.set(market, now);

  const secret = process.env.ORACLE_REFRESH_SECRET?.trim();
  const publishers = [
    process.env.ORACLE_PRIMARY_URL?.trim(),
    process.env.ORACLE_BACKUP_URL?.trim(),
  ].filter((url): url is string => Boolean(url));
  if (!secret || publishers.length !== 2)
    return NextResponse.json({ error: "Oracle refresh is not configured" }, { status: 503 });

  let accepted = false;
  for (const url of publishers) {
    try {
      const result = await fetch(`${url.replace(/\/+$/, "")}/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-oracle-refresh-secret": secret },
        body: JSON.stringify({ market }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      accepted ||= result.status === 202;
    } catch {
      // The next publisher may still complete or recover the round.
    }
  }
  return NextResponse.json({ accepted }, { status: accepted ? 202 : 503 });
}
