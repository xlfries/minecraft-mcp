export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string; isError: boolean };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

export interface ProviderResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface Provider {
  readonly label: string;
  chat(request: ProviderRequest): Promise<ProviderResponse>;
}

export type ProviderKind = "anthropic" | "ollama" | "openai";

export interface ProviderConfig {
  kind: ProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export type AgentEvent =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "tool-call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool-result"; id: string; name: string; text: string; isError: boolean }
  | { type: "error"; message: string }
  | { type: "done"; reason: "complete" | "max-steps" | "stopped" | "error" };
