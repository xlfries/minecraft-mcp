
import test from "ava";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Agent } from "../../src/agent/agent.js";
import type {
  Provider,
  ProviderRequest,
  ProviderResponse
} from "../../src/agent/types.js";
import { HistoryStore } from "../../src/memory/history-store.js";
import { ToolRegistry } from "../../src/tool-registry.js";

function createRegistry(handler: () => Promise<void> = async () => {}) {
  const registry = new ToolRegistry();

  registry.tool(
    "test_action",
    "A test action",
    { type: "object", properties: {} },
    async () => {
      await handler();
      return {
        content: [{ type: "text", text: "Action completed" }]
      };
    }
  );

  return registry;
}

function createProvider(
  respond: (request: ProviderRequest) => Promise<ProviderResponse>
) {
  const requests: ProviderRequest[] = [];

  const provider: Provider = {
    label: "test-provider",
    async chat(request) {
      requests.push({
        ...request,
        messages: structuredClone(request.messages)
      });

      return respond(request);
    }
  };

  return { provider, requests };
}

const finalResponse = async (): Promise<ProviderResponse> => ({
  content: "Ready.",
  toolCalls: []
});

test("Agent restores previous user and assistant messages", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-agent-"));

  try {
    const historyStore = new HistoryStore("Claude", root);

    await historyStore.append({
      type: "user",
      text: "Find diamonds"
    });
    await historyStore.append({
      type: "assistant",
      text: "I will explore underground"
    });
    await historyStore.append({
      type: "tool-call",
      id: "old-call",
      name: "test_action",
      arguments: {}
    });
    await historyStore.append({
      type: "tool-result",
      id: "old-call",
      name: "test_action",
      text: "Action completed",
      isError: false
    });

    const { provider, requests } = createProvider(finalResponse);

    const agent = new Agent({
      registry: createRegistry(),
      provider,
      system: "You control a Minecraft bot.",
      historyStore,
      onEvent: () => {}
    });

    await agent.run("What did I ask you to find?");

    t.is(requests.length, 1);
    t.deepEqual(
      requests[0].messages.map((message) => message.role),
      ["user", "assistant", "user"]
    );
    t.is(requests[0].messages[0].content, "Find diamonds");
    t.is(
      requests[0].messages[1].content,
      "I will explore underground"
    );
    t.is(
      requests[0].messages[2].content,
      "What did I ask you to find?"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent restores history only once per instance", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-agent-"));

  try {
    const historyStore = new HistoryStore("Claude", root);

    await historyStore.append({
      type: "user",
      text: "Original conversation"
    });
    await historyStore.append({
      type: "assistant",
      text: "Original response"
    });

    const { provider, requests } = createProvider(finalResponse);

    const agent = new Agent({
      registry: createRegistry(),
      provider,
      system: "You control a Minecraft bot.",
      historyStore,
      onEvent: () => {}
    });

    await agent.run("First new message");
    await agent.run("Second new message");

    t.is(requests.length, 2);

    t.is(
      requests[1].messages.filter(
        (message) =>
          message.role === "user" &&
          message.content === "Original conversation"
      ).length,
      1
    );

    t.is(
      requests[1].messages.filter(
        (message) =>
          message.role === "assistant" &&
          message.content === "Original response"
      ).length,
      1
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent does not replay historical tool calls", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-agent-"));
  let executions = 0;

  try {
    const historyStore = new HistoryStore("Claude", root);

    await historyStore.append({
      type: "user",
      text: "Do something"
    });
    await historyStore.append({
      type: "tool-call",
      id: "old-call",
      name: "test_action",
      arguments: {}
    });
    await historyStore.append({
      type: "tool-result",
      id: "old-call",
      name: "test_action",
      text: "Action completed",
      isError: false
    });

    const { provider } = createProvider(finalResponse);

    const agent = new Agent({
      registry: createRegistry(async () => {
        executions++;
      }),
      provider,
      system: "You control a Minecraft bot.",
      historyStore,
      onEvent: () => {}
    });

    await agent.run("Continue");

    t.is(executions, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Agent restores only the history belonging to its identity", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minecraft-agent-"));

  try {
    const claudeHistory = new HistoryStore("Claude", root);
    const chatgptHistory = new HistoryStore("ChatGPT", root);

    await claudeHistory.append({
      type: "user",
      text: "Claude's private conversation"
    });
    await chatgptHistory.append({
      type: "user",
      text: "ChatGPT's separate conversation"
    });

    const claude = createProvider(finalResponse);
    const chatgpt = createProvider(finalResponse);

    const claudeAgent = new Agent({
      registry: createRegistry(),
      provider: claude.provider,
      system: "You are Claude.",
      historyStore: claudeHistory,
      onEvent: () => {}
    });

    const chatgptAgent = new Agent({
      registry: createRegistry(),
      provider: chatgpt.provider,
      system: "You are ChatGPT.",
      historyStore: chatgptHistory,
      onEvent: () => {}
    });

    await claudeAgent.run("Continue");
    await chatgptAgent.run("Continue");

    t.is(
      claude.requests[0].messages[0].content,
      "Claude's private conversation"
    );
    t.is(
      chatgpt.requests[0].messages[0].content,
      "ChatGPT's separate conversation"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

