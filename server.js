import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import TinyNote from './printer.js';
import { performSearch, formatSearchResults, handleSearchErrors } from './search.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Validate required environment variables
if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

// Configuration from environment variables with defaults
const PRINTER_IP = process.env.PRINTER_IP || '10.1.1.30';
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
const MIN_PRINT_INTERVAL = parseInt(process.env.MIN_PRINT_INTERVAL_MS) || 3000;

const printer = new TinyNote(PRINTER_IP, PRINTER_PORT);

// Rate limiting to prevent overwhelming the printer
let lastPrintTime = 0;

// Prompt queue file (use /app/data for persistence in Docker)
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const PROMPTS_FILE = process.env.PROMPTS_FILE || path.join(DATA_DIR, 'prompts.json');

// Initialize prompts file if it doesn't exist (with error handling)
if (!fs.existsSync(PROMPTS_FILE)) {
  try {
    fs.writeFileSync(PROMPTS_FILE, JSON.stringify([], null, 2));
  } catch (error) {
    console.warn('⚠️  Could not create prompts.json:', error.message);
    console.warn('   Prompt queue feature will be disabled');
  }
}

/**
 * Sanitize content for thermal printer
 */
function sanitizeContent(content) {
  let sanitized = content;

  // Remove box-drawing characters that can cause issues
  const problematicChars = /[│─┌┐└┘├┤┬┴┼╭╮╰╯═║╒╓╔╕╖╗╘╙╚╛╜╝║╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬]/g;
  sanitized = sanitized.replace(problematicChars, '-');

  // Remove ESC/POS control characters (bytes 0x00-0x1F, but keep \n \r \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Check if web search is needed for the prompt
 * Uses AI to determine if current information is required
 */
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
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
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

/**
 * Generate content using OpenRouter with optional web search
 */
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

  // Step 1: Check if search is needed
  const needsSearch = await shouldSearchWeb(prompt);

  // Step 2: Perform search if needed
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
      } else {
        console.log('⚠️  Search failed or returned no results, continuing without search');
      }
    } catch (error) {
      console.log('⚠️  Search error, continuing without search:', error.message);
      // Graceful degradation - continue without search
    }
  }

  // Step 3: Generate content with or without search context
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Add search context if available
  if (searchContext) {
    messages.push({
      role: 'system',
      content: `RECENT WEB SEARCH RESULTS:\n${searchContext}\nUse this information to answer the user's question.`
    });
  }

  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: messages,
      max_tokens: 400
    })
  });

  const data = await response.json();
  const content = data.choices[0].message.content;
  return sanitizeContent(content);
}

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/print', async (req, res) => {
  try {
    const { message, align = 'left' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Print with cut
    await printer.printAndCut(message, { align });

    res.json({ success: true, message: 'Printed successfully!' });
  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ error: 'Failed to print', details: error.message });
  }
});

// Submit a prompt - auto-generate and print using OpenRouter
app.post('/prompt', async (req, res) => {
  try {
    const { prompt, align = 'left' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Rate limiting - wait before processing
    const now = Date.now();
    const timeSinceLastPrint = now - lastPrintTime;
    if (timeSinceLastPrint < MIN_PRINT_INTERVAL) {
      const waitTime = MIN_PRINT_INTERVAL - timeSinceLastPrint;
      console.log(`⏳ Waiting ${waitTime}ms to prevent printer overload...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    console.log(`\n🤖 Processing prompt: "${prompt}"`);

    // Generate content using OpenRouter
    const content = await generateContent(prompt);

    console.log(`✅ Generated content, printing...`);

    // Print the generated content
    await printer.printAndCut(content, { align });

    lastPrintTime = Date.now();
    console.log(`✅ Printed!\n`);

    res.json({ success: true, message: 'Generated and printed!', generatedContent: content });
  } catch (error) {
    console.error('Prompt error:', error);
    res.status(500).json({ error: 'Failed to process prompt', details: error.message });
  }
});

// Get pending prompts
app.get('/prompts', (req, res) => {
  try {
    if (!fs.existsSync(PROMPTS_FILE)) {
      return res.json({ prompts: [] });
    }
    const prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
    const pending = prompts.filter(p => p.status === 'pending');
    res.json({ prompts: pending });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get prompts', details: error.message });
  }
});

// Mark prompt as completed
app.delete('/prompts/:id', (req, res) => {
  try {
    if (!fs.existsSync(PROMPTS_FILE)) {
      return res.status(404).json({ error: 'Prompts file not found' });
    }

    const { id } = req.params;
    const prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));

    const updated = prompts.map(p => {
      if (p.id === parseInt(id)) {
        return { ...p, status: 'completed', completedAt: new Date().toISOString() };
      }
      return p;
    });

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
