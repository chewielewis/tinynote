# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the server
npm start

# Run printer tests (requires printer on network)
npm test

# Install dependencies
npm install
```

## Architecture

TinyNote is a web-based thermal printer service for Epson TM-T30 printers. The system uses AI (OpenRouter/Claude) to generate content and optionally perform web searches when current information is needed.

### Core Components

**server.js** - Express HTTP server with AI-powered content generation
- Exposes REST API endpoints for printing and AI generation
- Implements intelligent web search detection using a classifier
- Rate limits prints to prevent printer overwhelm (3-second minimum interval)
- Sanitizes content to remove problematic characters for thermal printing

**printer.js** - ESC/POS thermal printer driver
- Manages network connection to Epson TM-T30 (default: 10.1.1.30:9100)
- Sends data in 4KB chunks with 50ms delays to avoid buffer overflow
- Supports text formatting: alignment, bold, line feeds, paper cutting
- Converts emojis to monochrome bitmaps via canvas (currently disabled)
- Uses raw ESC/POS commands (0x1B, 0x1D) for printer control

**search.js** - Web search integration via OpenRouter's Perplexity models
- Uses `perplexity/sonar-small-online` model with built-in web search
- Implements in-memory caching with 5-minute TTL
- Formats search results for 80mm thermal paper (~32 chars wide)
- Graceful degradation: continues without search if API fails

### AI-Powered Web Search Flow

When a prompt is received via `POST /prompt`:

1. **Classification** (`shouldSearchWeb`): Ask Claude if the prompt needs current information
   - Uses only 10 tokens for efficiency
   - Returns "yes" for news, prices, weather, time-sensitive queries
   - Returns "nothing" for creative tasks, general knowledge

2. **Search** (if needed): Call Perplexity model via OpenRouter
   - Returns AI-generated answer with citation URLs
   - 10-second timeout (search models are slower)
   - Results cached to avoid duplicate searches

3. **Generation**: Create content with or without search context
   - System prompt ensures output is printer-friendly
   - Search results injected as additional system message
   - Content sanitized for thermal printer (removes box-drawing chars, control chars)

### API Endpoints

- `GET /` - Serves the web UI (public/index.html)
- `POST /print` - Print plain text directly to printer
  ```json
  { "message": "Hello", "align": "left" }
  ```
- `POST /prompt` - Generate content with AI (optionally with web search) and print
  ```json
  { "prompt": "What's the latest news?", "align": "center" }
  ```
- `GET /prompts` - Get pending prompts (from prompts.json queue)
- `DELETE /prompts/:id` - Mark prompt as completed

### Printer Configuration

The printer IP and port are hardcoded in server.js (line 14):
```javascript
const printer = new TinyNote('10.1.1.30', 9100);
```

To change the printer, modify the IP address in both `server.js` and `test.js`.

### Content Sanitization

Thermal printers have limited character support. The `sanitizeContent()` function:
- Removes box-drawing characters (│─┌┐└┘├┤┬┴┼╭╮╰╯═║╒╓╔╕╖╗╘╙╚╛╜╝)
- Strips ESC/POS control characters (0x00-0x1F except \n \r \t)
- Replaces problematic chars with simple dashes (-)

### Environment Variables

```bash
# .env file (optional)
OPENROUTER_API_KEY=sk-or-v1-...
```

The OpenRouter API key can be set in `.env` or hardcoded in `server.js` (line 17). The `.env` file is gitignored.

### Web Interface

The web UI (public/) has two modes:
- **Plain text**: Send raw text directly to printer
- **AI generates**: Use AI to create content (with optional web search)

### Rate Limiting

Print jobs are rate-limited to 3-second minimum intervals to prevent hardware damage. Concurrent requests wait automatically.

## Implementation Notes

- Uses ES modules (`"type": "module"` in package.json)
- Emoji rendering is disabled (`this.emojiRegex = /🚫DISABLED🚫/` in printer.js line 14)
- The canvas library is used only for emoji bitmap conversion
- Search timeout is 10 seconds (Perplexity models can be slower than generation)
- Prompt queue is stored in `prompts.json` but not actively used in current implementation
