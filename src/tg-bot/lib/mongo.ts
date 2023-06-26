import { MongoClient, Db, Collection, MongoClientOptions } from "mongodb";
import { MONGODB_URL } from "../client";

class MongoDB {
  private static instance: MongoDB;
  private mongoClient: MongoClient | undefined;
  private mongoDb: Db | undefined;

  private constructor() {}

  public static getInstance(): MongoDB {
    if (!MongoDB.instance) {
      MongoDB.instance = new MongoDB();
    }
    return MongoDB.instance;
  }

  public async connect(options?: MongoClientOptions): Promise<void> {
    try {
      this.mongoClient = new MongoClient(MONGODB_URL, options);
      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db();
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.mongoClient) {
        await this.mongoClient.close();
        this.mongoClient = undefined;
        this.mongoDb = undefined;
      }
    } catch (error) {
      console.error("Error occurred while closing MongoDB connection:", error);
    }
  }

  public getCollection<T>(
    collectionName: string
  ): Collection<Document> | undefined {
    if (this.mongoDb) {
      return this.mongoDb.collection<Document>(collectionName);
    }
    return undefined;
  }
}

export default MongoDB;
