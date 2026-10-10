import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "./db";
import { env } from "./env";

export type StoredFileMeta = { userId: string; contentType: string; filename: string; kind: "photo" | "photo_web" | "receipt" };

/**
 * Storage behind one interface. Default is GridFS (files live in your MongoDB, so any
 * host works, including serverless). "local" writes to UPLOAD_DIR for development.
 * To use S3 or Vercel Blob, implement this interface and return it from storage().
 */
export interface StorageProvider {
  put(data: Buffer, meta: StoredFileMeta): Promise<string>;
  get(key: string): Promise<{ data: Buffer; meta: StoredFileMeta } | null>;
  delete(key: string): Promise<void>;
}

class GridFsStorage implements StorageProvider {
  private async bucket() {
    await connectDB();
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database not connected");
    return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
  }

  async put(data: Buffer, meta: StoredFileMeta) {
    const bucket = await this.bucket();
    const id = new mongoose.Types.ObjectId();
    await new Promise<void>((resolve, reject) => {
      const stream = bucket.openUploadStreamWithId(id, meta.filename, { metadata: meta });
      stream.on("error", reject);
      stream.on("finish", () => resolve());
      stream.end(data);
    });
    return id.toString();
  }

  async get(key: string) {
    if (!mongoose.Types.ObjectId.isValid(key)) return null;
    const bucket = await this.bucket();
    const id = new mongoose.Types.ObjectId(key);
    const files = await bucket.find({ _id: id }).limit(1).toArray();
    if (!files.length) return null;
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      bucket
        .openDownloadStream(id)
        .on("data", (c: Buffer) => chunks.push(c))
        .on("error", reject)
        .on("end", () => resolve());
    });
    return { data: Buffer.concat(chunks), meta: files[0].metadata as StoredFileMeta };
  }

  async delete(key: string) {
    if (!mongoose.Types.ObjectId.isValid(key)) return;
    const bucket = await this.bucket();
    await bucket.delete(new mongoose.Types.ObjectId(key)).catch(() => undefined);
  }
}

class LocalStorage implements StorageProvider {
  private dir = path.resolve(env.uploadDir());
  private file(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("bad key");
    return path.join(this.dir, key);
  }
  async put(data: Buffer, meta: StoredFileMeta) {
    await mkdir(this.dir, { recursive: true });
    const key = randomUUID();
    await writeFile(this.file(key), data);
    await writeFile(this.file(key) + ".json", JSON.stringify(meta));
    return key;
  }
  async get(key: string) {
    try {
      const [data, meta] = await Promise.all([readFile(this.file(key)), readFile(this.file(key) + ".json", "utf8")]);
      return { data, meta: JSON.parse(meta) as StoredFileMeta };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await Promise.all([unlink(this.file(key)).catch(() => undefined), unlink(this.file(key) + ".json").catch(() => undefined)]);
  }
}

let instance: StorageProvider | null = null;
export function storage(): StorageProvider {
  if (!instance) instance = env.storageDriver() === "local" ? new LocalStorage() : new GridFsStorage();
  return instance;
}
