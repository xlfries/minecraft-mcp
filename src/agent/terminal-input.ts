import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { AgentInputQueue } from './input-queue.js';
import { log } from '../logger.js';

export function startTerminalInput(queue: AgentInputQueue): () => void {
  const input = createReadStream('/dev/tty');
  const terminal = createInterface({
    input,
    crlfDelay: Infinity
  });

  input.on('error', (error) => {
    log('info', `Terminal input unavailable: ${error.message}`);
    terminal.close();
  });

  terminal.on('line', (line) => {
    const prompt = line.trim();

    if (!prompt) {
      return;
    }

    void queue.enqueue(prompt, 'terminal').catch((error) => {
      log('error', `Terminal request failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  log('info', 'Terminal agent input is ready. Type a request and press Enter.');

  return () => {
    terminal.close();
    input.destroy();
  };
}
