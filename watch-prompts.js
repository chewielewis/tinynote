#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_FILE = path.join(__dirname, 'prompts.json');
const PROMPT_ENDPOINT = 'http://localhost:4000/prompts';

let lastPromptCount = 0;

async function checkPrompts() {
  try {
    const response = await fetch(PROMPT_ENDPOINT);
    const data = await response.json();
    const prompts = data.prompts || [];

    if (prompts.length > lastPromptCount) {
      console.log('\n🔔 New prompt(s) received!');
      prompts.forEach((p, i) => {
        if (i >= lastPromptCount) {
          console.log(`\n[${new Date(p.createdAt).toLocaleTimeString()}] ${p.prompt}`);
        }
      });
      console.log('\n💡 Process these prompts and they will be marked complete.');
    }

    lastPromptCount = prompts.length;
  } catch (error) {
    // Silently fail if server isn't running
  }
}

function markPromptComplete(promptId) {
  return fetch(`http://localhost:4000/prompts/${promptId}`, {
    method: 'DELETE'
  });
}

export { checkPrompts, markPromptComplete };

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('👀 Watching for prompts... (Ctrl+C to stop)\n');

  setInterval(checkPrompts, 2000);

  // Also check once on startup
  checkPrompts();
}
