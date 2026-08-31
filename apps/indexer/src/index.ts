import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import { MemeLendDatabase } from "@meme-lend/database";
import { eventRecords } from "./processor.js";
import { createServer } from "node:http";
import { refreshMarket } from "./projection.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const connection = new Connection(required("SOLANA_RPC_HTTP"), {
  commitment: "finalized",
  wsEndpoint: process.env.SOLANA_RPC_WS,
});
const programId = new PublicKey(required("PROGRAM_ID"));
const database = await MemeLendDatabase.connect(
  required("MONGODB_URI"),
  process.env.MONGODB_DATABASE,
);
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});

const api = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader(
    "access-control-allow-origin",
    process.env.WEB_ORIGIN ?? "http://localhost:3000",
  );
  try {
    const url = new URL(request.url ?? "/", "http://indexer.local");
    if (request.method !== "GET") {
      response.statusCode = 405;
      response.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    if (url.pathname === "/") {
      response.end(
        JSON.stringify({
          service: "Lend Meme Loans indexer",
          ok: true,
          commitment: "finalized",
          endpoints: ["/health", "/markets", "/markets/:address"],
        }),
      );
      return;
    }
    if (url.pathname === "/health") {
      response.end(JSON.stringify({ ok: true, commitment: "finalized" }));
      return;
    }
    if (url.pathname === "/markets") {
      const markets = await database
        .markets()
        .find({})
        .sort({ updatedAt: -1 })
        .limit(250)
        .toArray();
      response.end(JSON.stringify(markets));
      return;
    }
    const marketMatch = url.pathname.match(/^\/markets\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (marketMatch) {
      const market = await database.markets().findOne({ address: marketMatch[1] });
      if (!market) {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: "Market not found" }));
        return;
      }
      response.end(JSON.stringify(market));
      return;
    }
    const txMatch = url.pathname.match(/^\/markets\/([1-9A-HJ-NP-Za-km-z]{32,44})\/transactions$/);
    if (txMatch) {
      const transactions = await database
        .transactions()
        .find({ market: txMatch[1] })
        .sort({ slot: -1, eventIndex: -1 })
        .limit(250)
        .toArray();
      response.end(JSON.stringify(transactions));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    response.statusCode = 500;
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown failure" }),
    );
  }
});
api.listen(Number(process.env.PORT ?? "8787"), process.env.HOST ?? "0.0.0.0");

async function ingestSignature(
  info: Awaited<ReturnType<Connection["getSignaturesForAddress"]>>[number],
): Promise<void> {
  if (info.err) return;
  const tx = await connection.getParsedTransaction(info.signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return;
  const records = eventRecords(info, tx, programId);
  for (const record of records) await database.upsertTransaction(record);
  for (const market of new Set(records.flatMap((record) => (record.market ? [record.market] : []))))
    await refreshMarket(connection, database, market, info.slot);
  await database.saveCheckpoint("program-finalized", info.slot, info.signature);
}

const checkpoint = await database.checkpoints().findOne({ _id: "program-finalized" });
let before: string | undefined;
for (;;) {
  const page = await connection.getSignaturesForAddress(
    programId,
    { before, limit: 1000 },
    "finalized",
  );
  const pending = page.filter((item) => item.slot > (checkpoint?.slot ?? 0)).reverse();
  for (const item of pending) await ingestSignature(item);
  if (page.length < 1000 || pending.length === 0) break;
  before = page.at(-1)?.signature;
}

// MongoDB is a recoverable projection, not the source of truth. Reconcile every
// on-chain market at startup so a websocket outage or a checkpoint advancing past
// an unprocessed signature cannot permanently hide a valid market.
const [marketAccounts, reconciliationSlot] = await Promise.all([
  connection.getProgramAccounts(programId, {
    commitment: "finalized",
    filters: [{ dataSize: 260 }],
  }),
  connection.getSlot("finalized"),
]);
for (const { pubkey } of marketAccounts) {
  try {
    await refreshMarket(connection, database, pubkey.toBase58(), reconciliationSlot);
  } catch (error) {
    console.error(`Failed to reconcile market ${pubkey.toBase58()}`, error);
  }
}

const subscription = connection.onLogs(
  programId,
  async (logs, context) => {
    try {
      await ingestSignature({
        signature: logs.signature,
        slot: context.slot,
        err: logs.err,
        memo: null,
        blockTime: await connection.getBlockTime(context.slot),
        confirmationStatus: "finalized",
      });
    } catch (error) {
      console.error(`Failed to ingest finalized signature ${logs.signature}`, error);
    }
  },
  "finalized",
);
while (running) await new Promise((resolve) => setTimeout(resolve, 1000));
await connection.removeOnLogsListener(subscription);
await new Promise<void>((resolve, reject) =>
  api.close((error) => (error ? reject(error) : resolve())),
);
await database.close();
