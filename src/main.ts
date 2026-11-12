#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setupStdioFiltering } from './stdio-filter.js';
import { log } from './logger.js';
import { parseConfig } from './config.js';
import { BotConnection } from './bot-connection.js';
import { ToolFactory } from './tool-factory.js';
import { ToolRegistry } from './tool-registry.js';
import { MessageStore } from './message-store.js';
import { registerAllTools } from './register-tools.js';
import { Agent } from './agent/agent.js';
import { AgentInputQueue } from './agent/input-queue.js';
import { OllamaProvider } from './agent/providers/ollama-provider.js';
import { DEFAULT_SYSTEM_PROMPT, TOOL_PRESETS } from './agent/presets.js';
import { HistoryStore } from './memory/history-store.js';
import { startTerminalInput } from './agent/terminal-input.js';

setupStdioFiltering();

process.on('unhandledRejection', (reason) => {
  log('error', `Unhandled rejection: ${reason}`);
});

process.on('uncaughtException', (error) => {
  log('error', `Uncaught exception: ${error}`);
});

function sendMinecraftMessage(connection: BotConnection, message: string): void {
  const bot = connection.getBot();

  if (!bot || !connection.isConnected()) {
    return;
  }

  let remaining = message.trim();

  while (remaining.length > 0) {
    if (remaining.length <= 240) {
      bot.chat(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf(' ', 240);

    if (splitAt < 120) {
      splitAt = 240;
    }

    bot.chat(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
}

async function main() {
  const config = parseConfig();
  const messageStore = new MessageStore();
  let inputQueue: AgentInputQueue | null = null;
  let stopTerminalInput: (() => void) | null = null;

  const connection = new BotConnection(
    config,
    {
      onLog: log,
      onChatMessage: (username, message) => {
        messageStore.addMessage(username, message);

        if (!inputQueue || (message !== config.chatPrefix && !message.startsWith(config.chatPrefix + ' '))) {
          return;
        }

        const prompt = message.slice(config.chatPrefix.length).trim();

        if (!prompt) {
          return;
        }

        void inputQueue.enqueue(`${username}: ${prompt}`, `minecraft:${username}`).catch((error) => {
          log('error', `Minecraft request failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
  );

  const server = new McpServer({
    name: "minecraft-mcp-server",
    version: "2.0.4"
  });

  const registry = new ToolRegistry();
  const factory = new ToolFactory(registry, connection);
  const getBot = () => connection.getBot()!;

  registerAllTools(factory, getBot, messageStore);

  registry.mountOn(server);

  if (config.agent) {
    const provider = new OllamaProvider(config.agentModel, config.ollamaUrl);
    const historyStore = new HistoryStore(`Ollama-${config.agentModel}`);
    const allowedTools = config.agentTools === 'all'
      ? TOOL_PRESETS.all
      : TOOL_PRESETS.basic;

    const agent = new Agent({
      registry,
      provider,
      system: DEFAULT_SYSTEM_PROMPT,
      historyStore,
      allowedTools,
      onEvent: (event) => {
        if (event.type === 'assistant' && event.text.trim()) {
          log('info', `Agent: ${event.text}`);
          sendMinecraftMessage(connection, event.text);
        }

        if (event.type === 'tool-call') {
          log('info', `Agent calling tool: ${event.name}`);
        }

        if (event.type === 'tool-result') {
          const status = event.isError ? 'failed' : 'completed';
          log(event.isError ? 'warn' : 'info', `Agent tool ${status}: ${event.name}`);
        }

        if (event.type === 'error') {
          log('error', `Agent error: ${event.message}`);
        }

        if (event.type === 'done') {
          log('info', `Agent run finished: ${event.reason}`);
        }
      },
      onHistoryError: (error) => {
        log('error', `Agent history error: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    inputQueue = new AgentInputQueue(agent);
    stopTerminalInput = startTerminalInput(inputQueue);

    log('info', `Built-in agent enabled: ${provider.label}`);
    log('info', `Minecraft requests start with "${config.chatPrefix}". Available tools: ${config.agentTools}`);
  }

  connection.connect();

  process.stdin.on('end', () => {
    stopTerminalInput?.();
    connection.cleanup();
    log('info', 'MCP Client has disconnected. Shutting down...');
    process.exit(0);
  });

  if (process.stdin.isTTY) {
    log('info', 'Interactive terminal mode enabled. MCP stdio transport is disabled for this session.');
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error) => {
  log('error', `Fatal error in main(): ${error}`);
  process.exit(1);
});
