import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 100_000;
const RPC_TIMEOUT_MS = 15_000;

function rpcEndpoint() {
  return process.env.SOLANA_RPC_HTTP ?? "https://api.mainnet-beta.solana.com";
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "RPC request is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "RPC request is too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON-RPC request" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const upstream = await fetch(rpcEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const response = await upstream.text();
    return new NextResponse(response, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "Solana RPC timed out" : "Solana RPC is unavailable" },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
