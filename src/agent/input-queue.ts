
export interface AgentRunner {
  run(prompt: string): Promise<void>;
}

interface QueueItem {
  prompt: string;
  source: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class AgentInputQueue {
  private readonly queue: QueueItem[] = [];
  private processing = false;

  constructor(private readonly agent: AgentRunner) {}

  get pendingCount(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  enqueue(prompt: string, source: string): Promise<void> {
    const normalized = prompt.trim();

    if (!normalized) {
      return Promise.reject(new Error("Prompt cannot be empty"));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        prompt: normalized,
        source,
        resolve,
        reject
      });

      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;

        try {
          await this.agent.run(item.prompt);
          item.resolve();
        } catch (error) {
          item.reject(error);
        }
      }
    } finally {
      this.processing = false;

      if (this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }
}

