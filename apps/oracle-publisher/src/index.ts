import "dotenv/config";
import { createServer } from "node:http";
import { Connection } from "@solana/web3.js";
import { assertConfig, loadKeypair, publisherConfig } from "./config.js";
import { publishAll } from "./publisher.js";

const config = publisherConfig();
assertConfig(config);
const signer = loadKeypair();
const connection = new Connection(config.rpcHttp, "confirmed");
let running = true;
let cycleRunning = false;
let lastCycleAt: string | null = null;
let lastSuccessAt: string | null = null;
let consecutiveFailedCycles = 0;
let latestFailures: Array<{ market: string; error: string }> = [];
let balanceLamports: number | null = null;

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    running = false;
  });

async function alert(message: string): Promise<void> {
  if (!config.alertWebhookUrl) return;
  await fetch(config.alertWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ service: "lend-meme-loans-oracle", message, failures: latestFailures }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}

async function cycle(): Promise<void> {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    balanceLamports = await connection.getBalance(signer.publicKey, "confirmed");
    if (balanceLamports < config.minimumBalanceLamports)
      throw new Error(
        `Publisher balance ${balanceLamports} is below ${config.minimumBalanceLamports} lamports`,
      );
    const result = await publishAll(connection, signer, config);
    lastCycleAt = new Date().toISOString();
    latestFailures = result.failures;
    if (result.failures.length > 0) {
      consecutiveFailedCycles += 1;
      if (consecutiveFailedCycles === 1 || consecutiveFailedCycles % 4 === 0)
        await alert(`Oracle cycle has ${result.failures.length} failed market(s)`);
    } else {
      consecutiveFailedCycles = 0;
      lastSuccessAt = lastCycleAt;
    }
  } catch (error) {
    consecutiveFailedCycles += 1;
    latestFailures = [
      { market: "service", error: error instanceof Error ? error.message : "Unknown failure" },
    ];
    await alert(latestFailures[0]!.error);
  } finally {
    cycleRunning = false;
  }
}

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  if (request.url === "/health") {
    response.end(
      JSON.stringify({
        ok: true,
        publisher: signer.publicKey.toBase58(),
        standby: config.standby,
        balanceLamports,
        lastCycleAt,
      }),
    );
    return;
  }
  if (request.url === "/ready") {
    const ready = consecutiveFailedCycles < 3;
    response.statusCode = ready ? 200 : 503;
    response.end(
      JSON.stringify({
        ready,
        balanceLamports,
        lastSuccessAt,
        consecutiveFailedCycles,
        failures: latestFailures,
      }),
    );
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "Not found" }));
});
server.listen(config.port, "0.0.0.0");

await cycle();
while (running) {
  await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  await cycle();
}
await new Promise<void>((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);
