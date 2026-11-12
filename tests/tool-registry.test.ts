import test from 'ava';
import sinon from 'sinon';
import { ToolRegistry } from '../src/tool-registry.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const okHandler = async () => ({ content: [{ type: 'text' as const, text: 'ok' }] });

test('tool stores a definition retrievable by name', (t) => {
  const registry = new ToolRegistry();
  registry.tool('ping', 'Ping tool', {}, okHandler);

  const registered = registry.get('ping');
  t.is(registered?.name, 'ping');
  t.is(registered?.description, 'Ping tool');
  t.deepEqual(registered?.schema, {});
});

test('list returns tools in registration order', (t) => {
  const registry = new ToolRegistry();
  registry.tool('a', 'A', {}, okHandler);
  registry.tool('b', 'B', {}, okHandler);
  registry.tool('c', 'C', {}, okHandler);

  t.deepEqual(registry.list().map((entry) => entry.name), ['a', 'b', 'c']);
});

test('tool throws on duplicate name', (t) => {
  const registry = new ToolRegistry();
  registry.tool('dup', 'First', {}, okHandler);

  const error = t.throws(() => registry.tool('dup', 'Second', {}, okHandler));
  t.is(error?.message, 'Tool already registered: dup');
});

test('get returns undefined for unknown tool', (t) => {
  const registry = new ToolRegistry();
  t.is(registry.get('missing'), undefined);
});

test('call invokes the handler with the given args', async (t) => {
  const registry = new ToolRegistry();
  const handler = sinon.stub().resolves({ content: [{ type: 'text', text: 'done' }] });
  registry.tool('act', 'Act', {}, handler);

  const result = await registry.call('act', { x: 1 });

  t.true(handler.calledOnceWithExactly({ x: 1 }));
  t.deepEqual(result, { content: [{ type: 'text', text: 'done' }] });
});

test('call returns an error response for unknown tool', async (t) => {
  const registry = new ToolRegistry();

  const result = await registry.call('missing', {});

  t.deepEqual(result, {
    content: [{ type: 'text', text: 'Failed: Unknown tool: missing' }],
    isError: true
  });
});

test('mountOn registers every tool on the server with matching name, description and schema', (t) => {
  const registry = new ToolRegistry();
  const schemaA = { value: 'schema-a' };
  const schemaB = {};
  registry.tool('a', 'Tool A', schemaA, okHandler);
  registry.tool('b', 'Tool B', schemaB, okHandler);
  const server = { tool: sinon.stub() };

  registry.mountOn(server as unknown as McpServer);

  t.is(server.tool.callCount, 2);
  t.is(server.tool.firstCall.args[0], 'a');
  t.is(server.tool.firstCall.args[1], 'Tool A');
  t.is(server.tool.firstCall.args[2], schemaA);
  t.is(server.tool.secondCall.args[0], 'b');
  t.is(server.tool.secondCall.args[1], 'Tool B');
  t.is(server.tool.secondCall.args[2], schemaB);
});

test('mounted handler delegates to the registered handler', async (t) => {
  const registry = new ToolRegistry();
  const handler = sinon.stub().resolves({ content: [{ type: 'text', text: 'delegated' }] });
  registry.tool('act', 'Act', {}, handler);
  const server = { tool: sinon.stub() };

  registry.mountOn(server as unknown as McpServer);
  const mounted = server.tool.firstCall.args[3] as (args: unknown) => Promise<unknown>;
  const result = await mounted({ y: 2 });

  t.true(handler.calledOnceWithExactly({ y: 2 }));
  t.deepEqual(result, { content: [{ type: 'text', text: 'delegated' }] });
});
