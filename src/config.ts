import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export interface ServerConfig {
  host: string;
  port: number;
  username: string;
  agent: boolean;
  agentModel: string;
  ollamaUrl: string;
  agentTools: 'basic' | 'all';
  chatPrefix: string;
}

export function parseConfig(): ServerConfig {
  const config = yargs(hideBin(process.argv))
    .option('host', {
      type: 'string',
      description: 'Minecraft server host',
      default: 'localhost'
    })
    .option('port', {
      type: 'number',
      description: 'Minecraft server port',
      default: 25565
    })
    .option('username', {
      type: 'string',
      description: 'Bot username',
      default: 'LLMBot'
    })
    .option('agent', {
      type: 'boolean',
      description: 'Enable the built-in Ollama agent',
      default: false
    })
    .option('agent-model', {
      type: 'string',
      description: 'Ollama model used by the built-in agent',
      default: 'llama3.2:3b'
    })
    .option('ollama-url', {
      type: 'string',
      description: 'Ollama server URL',
      default: 'http://localhost:11434'
    })
    .option('agent-tools', {
      type: 'string',
      choices: ['basic', 'all'] as const,
      description: 'Minecraft tools available to the built-in agent',
      default: 'basic'
    })
    .option('chat-prefix', {
      type: 'string',
      description: 'Minecraft chat prefix for agent requests',
      default: '!bot'
    })
    .help()
    .alias('help', 'h')
    .parseSync();

  if (!config['chat-prefix'].trim()) {
    throw new Error('Chat prefix cannot be empty');
  }

  return {
    host: config.host,
    port: config.port,
    username: config.username,
    agent: config.agent,
    agentModel: config['agent-model'],
    ollamaUrl: config['ollama-url'],
    agentTools: config['agent-tools'] === 'all' ? 'all' : 'basic',
    chatPrefix: config['chat-prefix']
  };
}
