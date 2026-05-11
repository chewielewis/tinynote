import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import TinyNote from './printer.js';
import { performSearch, formatSearchResults, handleSearchErrors } from './search.js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

const PRINTER_IP = process.env.PRINTER_IP || '10.1.1.30';
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
const MIN_PRINT_INTERVAL = parseInt(process.env.MIN_PRINT_INTERVAL_MS) || 3000;

const printer = new TinyNote(PRINTER_IP, PRINTER_PORT);

let lastPrintTime = 0;

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const PROMPTS_FILE = process.env.PROMPTS_FILE || path.join(DATA_DIR, 'prompts.json');

if (!fs.existsSync(PROMPTS_FILE)) {
  try {
    fs.writeFileSync(PROMPTS_FILE, JSON.stringify([], null, 2));
  } catch (error) {
    console.warn('⚠️  Could not create prompts.json:', error.message);
  }
}

function sanitizeContent(content) {
  let sanitized = content;
  const problematicChars = /[│─┌┐└┘├┤┬┴┼╭╮╰╯═║╒╓╔╕╖╗╘╙╚╛╜╝║╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬]/g;
  sanitized = sanitized.replace(problematicChars, '-');
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitized;
}

// ── AI / Search ─────────────────────────────────────────────────────────

async function shouldSearchWeb(prompt) {
  const systemPrompt = `You are a classifier that determines if a prompt needs web search for current information.

Respond with ONLY "yes" or "nothing". No explanation.

Search needed for:
- Current news, events, or latest information
- Prices, stock markets, crypto values
- Weather, sports scores, live data
- Recent facts, announcements, releases
- Time-sensitive questions

No search needed for:
- Creative writing (poems, stories, jokes)
- General knowledge, definitions, explanations
- Calculations, conversions, coding help
- Personal opinions, advice, recommendations`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Does this need web search?\n\n"${prompt}"` }
        ],
        max_tokens: 10
      })
    });
    const data = await response.json();
    const result = data.choices[0].message.content.toLowerCase().trim();
    console.log(`🔍 Search decision: ${result}`);
    return result === 'yes';
  } catch (error) {
    console.error('Search decision failed:', error.message);
    return false;
  }
}

async function generateContent(prompt) {
  const systemPrompt = `You are TinyNote, a helpful assistant that generates content for a thermal printer.

Rules:
- Keep responses brief and printer-friendly (under 15 lines)
- Use plain text, no emojis or special characters
- Format for narrow paper (80mm / ~32 chars wide)
- Use simple dashes (-) for separators, not fancy characters
- Be creative and helpful
- If asked for a list, recipe, or similar, format clearly with simple bullets
- When search results are provided, incorporate them naturally into your answer`;

  let searchContext = '';
  const needsSearch = await shouldSearchWeb(prompt);

  if (needsSearch) {
    try {
      console.log('🌐 Web search triggered, fetching current info...');
      const searchResults = await performSearch(prompt, {
        apiKey: OPENROUTER_API_KEY,
        model: 'perplexity/sonar-small-online'
      });
      if (searchResults && !searchResults.error) {
        searchContext = formatSearchResults(searchResults);
        console.log('✅ Search results added to context');
      }
    } catch (error) {
      console.log('⚠️  Search error, continuing without search:', error.message);
    }
  }

  const messages = [{ role: 'system', content: systemPrompt }];
  if (searchContext) {
    messages.push({ role: 'system', content: `RECENT WEB SEARCH RESULTS:\n${searchContext}\nUse this information to answer the user's question.` });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: 400 })
  });

  const data = await response.json();
  return sanitizeContent(data.choices[0].message.content);
}

// ── Middleware ───────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Endpoints ───────────────────────────────────────────────────────────

/**
 * GET /capabilities — return supported formatting options
 */
app.get('/capabilities', (req, res) => {
  res.json({
    printer: {
      model: 'Epson TM-T30',
      paperWidth: '80mm',
      dotsPerLine: 576,
      charsPerLine: { fontA: 32, fontB: 48 },
    },
    commands: [
      { cmd: 'text', description: 'Print a line of text', params: ['value: string'] },
      { cmd: 'align', description: 'Set alignment', params: ['value: "left"|"center"|"right"'] },
      { cmd: 'bold', description: 'Bold on/off', params: ['value: boolean'] },
      { cmd: 'underline', description: 'Underline style', params: ['value: 0|1|2'] },
      { cmd: 'doubleWidth', description: 'Double-width on/off', params: ['value: boolean'] },
      { cmd: 'doubleHeight', description: 'Double-height on/off', params: ['value: boolean'] },
      { cmd: 'reverse', description: 'White-on-black mode', params: ['value: boolean'] },
      { cmd: 'fontB', description: 'Switch to compact font (~48 chars/line)', params: ['value: boolean'] },
      { cmd: 'lineSpacing', description: 'Set line spacing in dots', params: ['value: number (0-255)'] },
      { cmd: 'resetLineSpacing', description: 'Reset to default line spacing', params: [] },
      { cmd: 'feed', description: 'Feed N lines', params: ['value: number'] },
      { cmd: 'cut', description: 'Cut paper', params: ['value: "full"|undefined (partial)'] },
      { cmd: 'init', description: 'Initialize/reset printer', params: [] },
      {
        cmd: 'barcode',
        description: 'Print a barcode',
        params: ['value: data string', 'options: { type, height, width, hri }'],
        types: { 65: 'UPC-A', 66: 'UPC-E', 67: 'EAN13', 68: 'EAN8', 69: 'CODE39', 70: 'ITF', 71: 'CODABAR', 72: 'CODE93', 73: 'CODE128' },
      },
      {
        cmd: 'qrcode',
        description: 'Print a QR code',
        params: ['value: data string', 'options: { cellSize: 1-16, errorLevel: "L"|"M"|"Q"|"H" }'],
      },
    ],
    legacy: {
      endpoint: 'POST /print',
      format: '{ message: string, align?: "left"|"center"|"right" }',
      note: 'Legacy format still supported — maps to text + cut',
    },
  });
});

/**
 * POST /print — accept both legacy and command-array formats
 *
 * Legacy: { message, align }
 * New:    { commands: [{ cmd, value, options? }, ...] }
 *
 * Command arrays are batched into a single TCP send for performance.
 */
app.post('/print', async (req, res) => {
  try {
    const { message, align, commands } = req.body;

    // Rate limiting
    const now = Date.now();
    const timeSinceLastPrint = now - lastPrintTime;
    if (timeSinceLastPrint < MIN_PRINT_INTERVAL) {
      const waitTime = MIN_PRINT_INTERVAL - timeSinceLastPrint;
      console.log(`⏳ Rate limit: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    if (commands && Array.isArray(commands)) {
      // New command-array format — batch into single send
      if (commands.length === 0) {
        return res.status(400).json({ error: 'Commands array must not be empty' });
      }

      const buf = printer.buildCommands(commands);
      console.log(`🖨️  Sending ${commands.length} commands (${buf.length} bytes)`);
      await printer._send(buf);
      lastPrintTime = Date.now();

      res.json({ success: true, message: `Printed ${commands.length} commands (${buf.length} bytes)` });
    } else if (message) {
      // Legacy format
      await printer.printAndCut(message, { align });
      lastPrintTime = Date.now();

      res.json({ success: true, message: 'Printed successfully!' });
    } else {
      return res.status(400).json({
        error: 'Provide either { message, align } or { commands: [...] }',
      });
    }
  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ error: 'Failed to print', details: error.message });
  }
});

// Submit a prompt — auto-generate and print using OpenRouter
app.post('/prompt', async (req, res) => {
  try {
    const { prompt, align = 'left' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const now = Date.now();
    const timeSinceLastPrint = now - lastPrintTime;
    if (timeSinceLastPrint < MIN_PRINT_INTERVAL) {
      const waitTime = MIN_PRINT_INTERVAL - timeSinceLastPrint;
      console.log(`⏳ Waiting ${waitTime}ms to prevent printer overload...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    console.log(`\n🤖 Processing prompt: "${prompt}"`);
    const content = await generateContent(prompt);
    console.log(`✅ Generated content, printing...`);

    await printer.printAndCut(content, { align });
    lastPrintTime = Date.now();
    console.log(`✅ Printed!\n`);

    res.json({ success: true, message: 'Generated and printed!', generatedContent: content });
  } catch (error) {
    console.error('Prompt error:', error);
    res.status(500).json({ error: 'Failed to process prompt', details: error.message });
  }
});

app.get('/prompts', (req, res) => {
  try {
    if (!fs.existsSync(PROMPTS_FILE)) {
      return res.json({ prompts: [] });
    }
    const prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
    res.json({ prompts: prompts.filter(p => p.status === 'pending') });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prompts', details: error.message });
  }
});

app.delete('/prompts/:id', (req, res) => {
  try {
    if (!fs.existsSync(PROMPTS_FILE)) {
      return res.status(404).json({ error: 'Prompts file not found' });
    }
    const { id } = req.params;
    const prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
    const updated = prompts.map(p =>
      p.id === parseInt(id) ? { ...p, status: 'completed', completedAt: new Date().toISOString() } : p
    );
    fs.writeFileSync(PROMPTS_FILE, JSON.stringify(updated, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete prompt', details: error.message });
  }
});

const PORT = process.env.PORT || 4444;
app.listen(PORT, () => {
  console.log(`\n🖨️  TinyNote server running at http://localhost:${PORT}`);
  console.log(`📄 Printer: ${PRINTER_IP}:${PRINTER_PORT}`);
  console.log(`🤖 AI Model: ${OPENROUTER_MODEL}`);
  console.log(`⏱️  Min Print Interval: ${MIN_PRINT_INTERVAL}ms`);
});
