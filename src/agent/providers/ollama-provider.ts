
import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  Provider,
  ProviderRequest,
  ProviderResponse,
  ToolCall
} from "../types.js";

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaResponse {
  message?: {
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
  error?: string;
}

export class OllamaProvider implements Provider {
  readonly label: string;

  private readonly endpoint: string;

  constructor(
    private readonly model: string,
    baseUrl = "http://localhost:11434"
  ) {
    this.label = `Ollama (${model})`;
    this.endpoint = `${baseUrl.replace(/\/+$/, "")}/api/chat`;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          {
            role: "system",
            content: request.system
          },
          ...request.messages.map((message) => this.formatMessage(message))
        ],
        tools: request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        }))
      }),
      signal: request.signal
    });

    const data = await response.json() as OllamaResponse;

    if (!response.ok) {
      throw new Error(
        data.error ?? `Ollama request failed: HTTP ${response.status}`
      );
    }

    if (!data.message) {
      throw new Error("Ollama returned an invalid response");
    }

    return {
      content: data.message.content ?? "",
      toolCalls: (data.message.tool_calls ?? []).map(
        (call): ToolCall => ({
          id: randomUUID(),
          name: call.function.name,
          arguments: call.function.arguments ?? {}
        })
      )
    };
  }

  private formatMessage(message: ChatMessage) {
    if (message.role === "user") {
      return {
        role: "user",
        content: message.content
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolCalls.length > 0
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                function: {
                  name: call.name,
                  arguments: call.arguments
                }
              }))
            }
          : {})
      };
    }

    return {
      role: "tool",
      content: message.content,
      tool_name: message.name
    };
  }
}

