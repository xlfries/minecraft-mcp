import { mkdir, appendFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import type { AgentEvent } from "../agent/types.js";

export interface HistoryEntry {
  timestamp: string;
  event: AgentEvent;
}

export class HistoryStore {
  private readonly filePath: string;
  private pending: Promise<void> = Promise.resolve();

  constructor(identity: string, root = "data/bots") {
    const safeIdentity = identity
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/^\.+|\.+$/g, "")
      .trim();

    if (!safeIdentity) {
      throw new Error("Bot identity cannot be empty");
    }

    this.filePath = path.resolve(root, safeIdentity, "history.txt");
  }

  getPath(): string {
    return this.filePath;
  }

  append(event: AgentEvent): Promise<void> {
    const entry: HistoryEntry = {
      timestamp: new Date().toISOString(),
      event
    };

    const line = JSON.stringify(entry) + "\n";

    const write = this.pending.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, line, "utf8");
    });

    this.pending = write.catch(() => {});
    return write;
  }

  async getRecent(count = 20): Promise<HistoryEntry[]> {
    if (count <= 0) {
      return [];
    }

    await this.pending;

    const entries: HistoryEntry[] = [];

    try {
      const stream = createReadStream(this.filePath, {
        encoding: "utf8"
      });

      const reader = createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      for await (const line of reader) {
        if (!line.trim()) continue;

        try {
          entries.push(JSON.parse(line) as HistoryEntry);

          if (entries.length > count) {
            entries.shift();
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    return entries;
  }

  async search(query: string, limit = 20): Promise<HistoryEntry[]> {
    if (!query.trim() || limit <= 0) {
      return [];
    }

    await this.pending;

    const matches: HistoryEntry[] = [];
    const normalizedQuery = query.toLowerCase();

    try {
      const stream = createReadStream(this.filePath, {
        encoding: "utf8"
      });

      const reader = createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      for await (const line of reader) {
        if (!line.trim() || !line.toLowerCase().includes(normalizedQuery)) {
          continue;
        }

        try {
          matches.push(JSON.parse(line) as HistoryEntry);

          if (matches.length > limit) {
            matches.shift();
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    return matches;
  }
}
