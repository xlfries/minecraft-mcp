import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type McpResponse = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
};

export type ToolHandler = (args: unknown) => Promise<McpResponse>;

export interface ToolSink {
  tool(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: ToolHandler
  ): unknown;
}

export interface RegisteredTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: ToolHandler;
}

export class ToolRegistry implements ToolSink {
  private tools = new Map<string, RegisteredTool>();

  tool(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: ToolHandler
  ): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.tools.set(name, { name, description, schema, handler });
  }

  list(): RegisteredTool[] {
    return [...this.tools.values()];
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  async call(name: string, args: unknown): Promise<McpResponse> {
    const registered = this.tools.get(name);
    if (!registered) {
      return {
        content: [{ type: "text", text: `Failed: Unknown tool: ${name}` }],
        isError: true
      };
    }
    return registered.handler(args);
  }

  mountOn(server: McpServer): void {
    for (const registered of this.tools.values()) {
      server.tool(
        registered.name,
        registered.description,
        registered.schema,
        async (args: unknown): Promise<McpResponse> => registered.handler(args)
      );
    }
  }
}
