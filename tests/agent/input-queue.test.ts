
import test from "ava";
import { AgentInputQueue } from "../../src/agent/input-queue.js";

test("AgentInputQueue processes prompts in order", async (t) => {
  const received: string[] = [];

  const agent = {
    async run(prompt: string) {
      received.push(prompt);
    }
  };

  const queue = new AgentInputQueue(agent);

  await Promise.all([
    queue.enqueue("First", "terminal"),
    queue.enqueue("Second", "minecraft"),
    queue.enqueue("Third", "terminal")
  ]);

  t.deepEqual(received, ["First", "Second", "Third"]);
  t.false(queue.isProcessing());
  t.is(queue.pendingCount, 0);
});

test("AgentInputQueue does not overlap Agent runs", async (t) => {
  let activeRuns = 0;
  let maximumActiveRuns = 0;

  const agent = {
    async run() {
      activeRuns++;
      maximumActiveRuns = Math.max(maximumActiveRuns, activeRuns);

      await new Promise((resolve) => setTimeout(resolve, 20));

      activeRuns--;
    }
  };

  const queue = new AgentInputQueue(agent);

  await Promise.all([
    queue.enqueue("First", "terminal"),
    queue.enqueue("Second", "minecraft"),
    queue.enqueue("Third", "terminal")
  ]);

  t.is(maximumActiveRuns, 1);
});

test("AgentInputQueue continues after a failed prompt", async (t) => {
  const received: string[] = [];

  const agent = {
    async run(prompt: string) {
      received.push(prompt);

      if (prompt === "Fail") {
        throw new Error("Test failure");
      }
    }
  };

  const queue = new AgentInputQueue(agent);

  const first = queue.enqueue("Fail", "terminal");
  const second = queue.enqueue("Continue", "minecraft");

  await t.throwsAsync(first, { message: "Test failure" });
  await second;

  t.deepEqual(received, ["Fail", "Continue"]);
});

test("AgentInputQueue rejects empty prompts", async (t) => {
  const agent = {
    async run() {}
  };

  const queue = new AgentInputQueue(agent);

  await t.throwsAsync(
    queue.enqueue("   ", "terminal"),
    { message: "Prompt cannot be empty" }
  );
});

test("AgentInputQueue tracks pending prompts", async (t) => {
  let releaseFirst: (() => void) | undefined;

  const agent = {
    async run() {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    }
  };

  const queue = new AgentInputQueue(agent);

  const first = queue.enqueue("First", "terminal");

  await new Promise((resolve) => setImmediate(resolve));

  const second = queue.enqueue("Second", "minecraft");

  t.true(queue.isProcessing());
  t.is(queue.pendingCount, 1);

  releaseFirst?.();

  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));

  releaseFirst?.();

  await Promise.all([first, second]);

  t.is(queue.pendingCount, 0);
  t.false(queue.isProcessing());
});

