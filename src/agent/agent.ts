import type { ToolRegistry } from "../tool-registry.js";
import { buildToolSpecs } from "../tool-schema.js";
import type { AgentEvent, ChatMessage, Provider, ToolSpec } from "./types.js";

export interface AgentOptions {
  registry: ToolRegistry;
  provider: Provider;
  system: string;
  allowedTools?: readonly string[] | null;
  maxSteps?: number;
  maxHistory?: number;
  onEvent: (event: AgentEvent) => void;
}

const DEFAULT_MAX_STEPS = 25;
const DEFAULT_MAX_HISTORY = 80;

export class Agent {
  private history: ChatMessage[] = [];
  private controller: AbortController | null = null;
  private readonly allowed: ReadonlySet<string> | null;
  private readonly specs: ToolSpec[];

  constructor(private options: AgentOptions) {
    this.allowed = options.allowedTools ? new Set(options.allowedTools) : null;
    this.specs = buildToolSpecs(options.registry, this.allowed);
  }

  get toolNames(): string[] {
    return this.specs.map((spec) => spec.name);
  }

  isRunning(): boolean {
    return this.controller !== null;
  }

  stop(): void {
    this.controller?.abort();
  }

  reset(): void {
    if (this.controller) {
      throw new Error("Agent is running");
    }
    this.history = [];
  }

  async run(prompt: string): Promise<void> {
    if (this.controller) {
      throw new Error("Agent is already running");
    }
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    const maxSteps = this.options.maxSteps ?? DEFAULT_MAX_STEPS;

    this.history.push({ role: "user", content: prompt });
    this.emit({ type: "user", text: prompt });

    try {
      for (let step = 0; step < maxSteps; step++) {
        this.trimHistory();
        const response = await this.options.provider.chat({
          system: this.options.system,
          messages: this.history,
          tools: this.specs,
          signal
        });

        if (signal.aborted) {
          this.finish("stopped");
          return;
        }

        if (response.content) {
          this.emit({ type: "assistant", text: response.content });
        }

        if (response.toolCalls.length === 0) {
          if (response.content) {
            this.history.push({ role: "assistant", content: response.content, toolCalls: [] });
          }
          this.finish("complete");
          return;
        }

        this.history.push({ role: "assistant", content: response.content, toolCalls: response.toolCalls });

        for (const call of response.toolCalls) {
          if (signal.aborted) {
            this.history.push(this.toolMessage(call.id, call.name, "Stopped before running", true));
            continue;
          }

          this.emit({ type: "tool-call", id: call.id, name: call.name, arguments: call.arguments });
          const { text, isError } = await this.execute(call.name, call.arguments);
          this.emit({ type: "tool-result", id: call.id, name: call.name, text, isError });
          this.history.push(this.toolMessage(call.id, call.name, text, isError));
        }

        if (signal.aborted) {
          this.finish("stopped");
          return;
        }
      }

      this.finish("max-steps");
    } catch (error) {
      if (signal.aborted) {
        this.finish("stopped");
        return;
      }
      this.emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
      this.finish("error");
    } finally {
      this.controller = null;
    }
  }

  private async execute(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    if (this.allowed && !this.allowed.has(name)) {
      return { text: `Failed: Unknown tool: ${name}`, isError: true };
    }
    try {
      const result = await this.options.registry.call(name, args);
      const text = result.content.map((part) => part.text).join("\n");
      return { text, isError: result.isError === true };
    } catch (error) {
      return { text: `Failed: ${error instanceof Error ? error.message : String(error)}`, isError: true };
    }
  }

  private toolMessage(toolCallId: string, name: string, content: string, isError: boolean): ChatMessage {
    return { role: "tool", toolCallId, name, content, isError };
  }

  private trimHistory(): void {
    const limit = this.options.maxHistory ?? DEFAULT_MAX_HISTORY;
    if (this.history.length <= limit) {
      return;
    }
    const start = this.history.length - limit;
    const boundary = this.history.findIndex((message, index) => index >= start && message.role === "user");
    if (boundary > 0) {
      this.history = this.history.slice(boundary);
    }
  }

  private finish(reason: "complete" | "max-steps" | "stopped" | "error"): void {
    this.emit({ type: "done", reason });
  }

  private emit(event: AgentEvent): void {
    try {
      this.options.onEvent(event);
    } catch {
      return;
    }
  }
}
