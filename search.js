/**
 * TinyNote Web Search Module
 * Uses OpenRouter's Perplexity models with built-in web search
 */

// Configuration from environment variables with defaults
const SEARCH_TIMEOUT = parseInt(process.env.SEARCH_TIMEOUT_MS) || 10000; // 10 seconds (web search models can be slower)
const CACHE_TTL = parseInt(process.env.CACHE_TTL_MS) || (5 * 60 * 1000); // 5 minutes in milliseconds
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'perplexity/sonar-small-online';

// In-memory cache to avoid duplicate searches
const searchCache = new Map();

/**
 * Perform a web search using OpenRouter's Perplexity model
 * @param {string} query - The search query
 * @param {object} options - Search options
 * @param {string} options.apiKey - OpenRouter API key
 * @param {string} options.model - Model to use (default: perplexity/sonar-small-online)
 * @param {number} options.timeout - Request timeout in ms (default: 10000)
 * @returns {Promise<object>} Search results with answer
 */
export async function performSearch(query, options = {}) {
  const { apiKey, model = PERPLEXITY_MODEL, timeout = SEARCH_TIMEOUT } = options;

  // Check cache first
  const cached = getCachedResult(query);
  if (cached) {
    console.log(`📦 Using cached search result for: "${query}"`);
    return cached;
  }

  if (!apiKey) {
    throw new Error('OpenRouter API key is required');
  }

  console.log(`🔍 Searching web via Perplexity: "${query}"`);

  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search timeout')), timeout)
    );

    // Create search promise
    const searchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant with web search access. Provide concise, accurate answers based on your search results. Include important facts and be direct.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: 300,
        search_domain_filter: ['news', 'wikipedia', 'general'] // Optional: filter search domains
      })
    });

    // Race between search and timeout
    const response = await Promise.race([searchPromise, timeoutPromise]);

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
  const content = data.choices[0].message.content;
  const citations = data.choices[0].message.citations || [];

    // Format results similar to Tavily for consistency
    const formattedResult = {
      answer: content,
      results: citations.map((url, index) => ({
        title: `Source ${index + 1}`,
        url: url
      })),
    };

    // Cache the result
    cacheResult(query, formattedResult);

    console.log(`✅ Search completed: ${citations.length} sources`);
    return formattedResult;
  } catch (error) {
    return handleSearchErrors(error);
  }
}

/**
 * Format search results for 80mm thermal printer
 * @param {object} searchResults - Raw search results from Tavily
 * @returns {string} Formatted results for printing
 */
export function formatSearchResults(searchResults) {
  if (!searchResults) {
    return '';
  }

  const parts = [];

  // Add the AI-generated answer if available
  if (searchResults.answer) {
    parts.push('--- WEB SEARCH ---');
    parts.push(truncateText(searchResults.answer, 250));
    parts.push('');
  }

  // Add top 2-3 sources
  if (searchResults.results && searchResults.results.length > 0) {
    parts.push('Sources:');

    const topResults = searchResults.results.slice(0, 3);
    topResults.forEach((result, index) => {
      const title = truncateText(result.title, 40);
      const url = formatUrl(result.url);

      parts.push(`${index + 1}. ${title}`);
      parts.push(`   ${url}`);
    });

    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Handle search errors gracefully
 * @param {Error} error - The error that occurred
 * @returns {object} Null result to allow graceful degradation
 */
export function handleSearchErrors(error) {
  console.error(`❌ Search error: ${error.message}`);

  // Return null result - caller can decide what to do
  return {
    answer: null,
    results: [],
    error: error.message,
  };
}

/**
 * Check if a query is in the cache and still valid
 * @param {string} query - The search query
 * @returns {object|null} Cached result or null
 */
function getCachedResult(query) {
  const cached = searchCache.get(query);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    searchCache.delete(query);
    return null;
  }

  return cached.data;
}

/**
 * Store a search result in the cache
 * @param {string} query - The search query
 * @param {object} data - The search result data
 */
function cacheResult(query, data) {
  searchCache.set(query, {
    data: data,
    timestamp: Date.now(),
  });

  // Clean up old cache entries periodically
  if (searchCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of searchCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        searchCache.delete(key);
      }
    }
  }
}

/**
 * Truncate text to fit on thermal printer
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength
    ? cleaned.substring(0, maxLength - 3) + '...'
    : cleaned;
}

/**
 * Format URL for display (shorten domain)
 * @param {string} url - Full URL
 * @returns {string} Shortened URL
 */
function formatUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url.substring(0, 30);
  }
}
