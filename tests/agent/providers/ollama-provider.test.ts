
import test from "ava";
import { OllamaProvider } from "../../../src/agent/providers/ollama-provider.js";
import type { ProviderRequest } from "../../../src/agent/types.js";

function createRequest(signal?: AbortSignal): ProviderRequest {
  return {
    system: "You control a Minecraft bot.",
    messages: [
      {
        role: "user",
        content: "Find some diamonds."
      },
      {
        role: "assistant",
        content: "I'll search underground.",
        toolCalls: [
          {
            id: "call-1",
            name: "find-blocks",
            arguments: {
              block: "diamond_ore"
            }
          }
        ]
      },
      {
        role: "tool",
        toolCallId: "call-1",
        name: "find-blocks",
        content: "Found 3 diamond ores.",
        isError: false
      }
    ],
    tools: [
      {
        name: "find-blocks",
        description: "Find nearby blocks.",
        parameters: {
          type: "object",
          properties: {
            block: {
              type: "string"
            }
          }
        }
      }
    ],
    signal
  };
}

async function withMockFetch(
  mock: typeof fetch,
  run: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test.serial("OllamaProvider sends the correct chat request", async (t) => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;

    return new Response(
      JSON.stringify({
        message: {
          content: "I found the diamonds.",
          tool_calls: []
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  };

  await withMockFetch(mockFetch, async () => {
    const controller = new AbortController();
    const provider = new OllamaProvider(
      "llama3.3",
      "http://localhost:11434/"
    );

    const result = await provider.chat(createRequest(controller.signal));

    t.is(provider.label, "Ollama (llama3.3)");
    t.is(requestedUrl, "http://localhost:11434/api/chat");
    t.is(requestedInit?.method, "POST");
    t.is(requestedInit?.signal, controller.signal);

    const body = JSON.parse(String(requestedInit?.body));

    t.is(body.model, "llama3.3");
    t.is(body.stream, false);
    t.is(body.messages[0].role, "system");
    t.is(body.messages[0].content, "You control a Minecraft bot.");

    t.is(body.messages[1].role, "user");
    t.is(body.messages[1].content, "Find some diamonds.");

    t.is(body.messages[2].role, "assistant");
    t.is(body.messages[2].content, "I'll search underground.");
    t.is(body.messages[2].tool_calls[0].function.name, "find-blocks");
    t.deepEqual(
      body.messages[2].tool_calls[0].function.arguments,
      { block: "diamond_ore" }
    );

    t.is(body.messages[3].role, "tool");
    t.is(body.messages[3].content, "Found 3 diamond ores.");
    t.is(body.messages[3].tool_name, "find-blocks");

    t.is(body.tools.length, 1);
    t.is(body.tools[0].type, "function");
    t.is(body.tools[0].function.name, "find-blocks");
    t.deepEqual(result, {
      content: "I found the diamonds.",
      toolCalls: []
    });
  });
});

test.serial("OllamaProvider converts tool calls into Agent tool calls", async (t) => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        message: {
          content: "I'll look for the nearest diamond ore.",
          tool_calls: [
            {
              function: {
                name: "find-blocks",
                arguments: {
                  block: "diamond_ore",
                  maxDistance: 32
                }
              }
            }
          ]
        }
      }),
      { status: 200 }
    );
  };

  await withMockFetch(mockFetch, async () => {
    const provider = new OllamaProvider("qwen3");
    const result = await provider.chat(createRequest());

    t.is(result.content, "I'll look for the nearest diamond ore.");
    t.is(result.toolCalls.length, 1);
    t.is(result.toolCalls[0].name, "find-blocks");
    t.deepEqual(result.toolCalls[0].arguments, {
      block: "diamond_ore",
      maxDistance: 32
    });
    t.regex(result.toolCalls[0].id, /^[0-9a-f-]{36}$/i);
  });
});

test.serial("OllamaProvider throws API errors", async (t) => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        error: "model 'missing-model' not found"
      }),
      { status: 404 }
    );
  };

  await withMockFetch(mockFetch, async () => {
    const provider = new OllamaProvider("missing-model");

    await t.throwsAsync(
      () => provider.chat(createRequest()),
      {
        message: "model 'missing-model' not found"
      }
    );
  });
});

test.serial("OllamaProvider handles HTTP errors without an API message", async (t) => {
  const mockFetch: typeof fetch = async () => {
    return new Response("Unavailable", {
      status: 503
    });
  };

  await withMockFetch(mockFetch, async () => {
    const provider = new OllamaProvider("llama3.3");

    await t.throwsAsync(
      () => provider.chat(createRequest()),
      {
        message: "Ollama request failed: HTTP 503"
      }
    );
  });
});

test.serial("OllamaProvider rejects invalid responses", async (t) => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        done: true
      }),
      { status: 200 }
    );
  };

  await withMockFetch(mockFetch, async () => {
    const provider = new OllamaProvider("llama3.3");

    await t.throwsAsync(
      () => provider.chat(createRequest()),
      {
        message: "Ollama returned an invalid response"
      }
    );
  });
});

