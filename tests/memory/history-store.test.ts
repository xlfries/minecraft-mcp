import test from "ava";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HistoryStore } from "../../src/memory/history-store.js";

test("HistoryStore creates and appends history entries", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-history-"));

  try {
    const store = new HistoryStore("Claude", root);

    await store.append({ type: "user", text: "Find diamonds" });
    await store.append({ type: "assistant", text: "I will explore underground" });

    const entries = await store.getRecent();

    t.is(entries.length, 2);
    t.is(entries[0].event.type, "user");
    t.is(entries[1].event.type, "assistant");
    t.truthy(entries[0].timestamp);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HistoryStore retrieves only the requested number of recent entries", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-history-"));

  try {
    const store = new HistoryStore("Claude", root);

    for (let i = 0; i < 10; i++) {
      await store.append({ type: "user", text: `Message ${i}` });
    }

    const entries = await store.getRecent(3);

    t.is(entries.length, 3);
    t.is(entries[0].event.type === "user" ? entries[0].event.text : "", "Message 7");
    t.is(entries[2].event.type === "user" ? entries[2].event.text : "", "Message 9");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HistoryStore searches history without case sensitivity", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-history-"));

  try {
    const store = new HistoryStore("Claude", root);

    await store.append({ type: "user", text: "Found diamonds underground" });
    await store.append({ type: "user", text: "Collected some iron" });

    const results = await store.search("DIAMONDS");

    t.is(results.length, 1);
    t.is(results[0].event.type === "user" ? results[0].event.text : "", "Found diamonds underground");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HistoryStore keeps different bot histories separate", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-history-"));

  try {
    const claude = new HistoryStore("Claude", root);
    const chatgpt = new HistoryStore("ChatGPT", root);

    await claude.append({ type: "user", text: "Hello from Claude" });
    await chatgpt.append({ type: "user", text: "Hello from ChatGPT" });

    const claudeHistory = await claude.getRecent();
    const chatgptHistory = await chatgpt.getRecent();

    t.is(claudeHistory.length, 1);
    t.is(chatgptHistory.length, 1);
    t.not(claude.getPath(), chatgpt.getPath());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HistoryStore handles missing history files", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-history-"));

  try {
    const store = new HistoryStore("NewBot", root);

    t.deepEqual(await store.getRecent(), []);
    t.deepEqual(await store.search("anything"), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
