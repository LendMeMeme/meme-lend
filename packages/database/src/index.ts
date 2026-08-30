import { MongoClient, type Collection, type Db } from "mongodb";
import type { IndexedTransaction, MarketView, OracleObservationView } from "@meme-lend/shared";

export interface IndexerCheckpoint {
  _id: string;
  slot: number;
  signature: string | null;
  updatedAt: Date;
}
export class MemeLendDatabase {
  private constructor(
    private readonly client: MongoClient,
    readonly db: Db,
  ) {}
  static async connect(uri: string, databaseName = "meme_lend"): Promise<MemeLendDatabase> {
    const client = new MongoClient(uri);
    await client.connect();
    const result = new MemeLendDatabase(client, client.db(databaseName));
    await result.ensureIndexes();
    return result;
  }
  markets(): Collection<MarketView> {
    return this.db.collection<MarketView>("markets");
  }
  transactions(): Collection<IndexedTransaction> {
    return this.db.collection<IndexedTransaction>("transactions");
  }
  observations(): Collection<OracleObservationView> {
    return this.db.collection<OracleObservationView>("oracle_observations");
  }
  checkpoints(): Collection<IndexerCheckpoint> {
    return this.db.collection<IndexerCheckpoint>("indexer_checkpoints");
  }
  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.markets().createIndex({ address: 1 }, { unique: true }),
      this.markets().createIndex({ status: 1, updatedAt: -1 }),
      this.transactions().createIndex({ id: 1 }, { unique: true }),
      this.transactions().createIndex({ market: 1, slot: -1 }),
      this.observations().createIndex({ id: 1 }, { unique: true }),
      this.observations().createIndex({ market: 1, slot: -1 }),
    ]);
  }
  async upsertTransaction(value: IndexedTransaction): Promise<void> {
    await this.transactions().updateOne(
      { id: value.id },
      { $setOnInsert: value },
      { upsert: true },
    );
  }
  async upsertMarket(value: MarketView): Promise<void> {
    await this.markets().updateOne({ address: value.address }, { $set: value }, { upsert: true });
  }
  async upsertObservation(value: OracleObservationView): Promise<void> {
    await this.observations().updateOne({ id: value.id }, { $set: value }, { upsert: true });
  }
  async saveCheckpoint(stream: string, slot: number, signature: string | null): Promise<void> {
    await this.checkpoints().updateOne(
      { _id: stream },
      { $max: { slot }, $set: { signature, updatedAt: new Date() } },
      { upsert: true },
    );
  }
  async close(): Promise<void> {
    await this.client.close();
  }
}
