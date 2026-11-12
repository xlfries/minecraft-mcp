import { z, ZodType } from "zod";
import type { ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolRegistry } from "./tool-registry.js";
import type { ToolSpec } from "./agent/types.js";

export type JsonSchema = Record<string, unknown>;

export function toJsonSchema(schema: Record<string, unknown>): JsonSchema {
  const values = Object.values(schema);
  if (values.length === 0 || !values.every((value) => value instanceof ZodType)) {
    return { type: "object", properties: {}, additionalProperties: false };
  }
  const converted = zodToJsonSchema(z.object(schema as ZodRawShape), { $refStrategy: "none" }) as JsonSchema;
  delete converted.$schema;
  return converted;
}

export function buildToolSpecs(registry: ToolRegistry, allowed?: ReadonlySet<string> | null): ToolSpec[] {
  return registry
    .list()
    .filter((tool) => !allowed || allowed.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema(tool.schema)
    }));
}
