# browser-agent

This is an experimental project that exposes an x.com account as API, it need you run Chrome with CDP enabled and login the x.com account first.

## API Endpoints

### GET /home_timeline
Retrieves the home timeline tweets.

### GET /user/:screen_name
Retrieves tweets from a specific user's timeline.
- `:screen_name` - The Twitter screen name of the user
- Query parameters:
  - `tab` (optional) - One of `tweets` (default), `replies`, `media`

### GET /mentions
Retrieves mentions for the authenticated user.

### GET /user/:screen_name/:tweet_id
Retrieves a specific tweet.
- `:screen_name` - The Twitter screen name of the user
- `:tweet_id` - The ID of the tweet
- For article tweets, the response includes:
  - `article` - Resolved blocks with inlined entity data (media URLs, markdown, embedded tweets)
  - `article_markdown` - The article content converted to Markdown
  - `article_title` - The article title
  - `article_cover` - The cover image URL

### GET /user/:screen_name/status/:tweet_id
Alternative endpoint to retrieve a specific tweet (same as above).

### GET /thread/:screen_name/:tweet_id
Retrieves a tweet thread with replies.
- `:screen_name` - The Twitter screen name of the user
- `:tweet_id` - The ID of the tweet
- Query parameters:
  - `max` (optional) - Maximum number of replies to fetch (default: 100)
- Response:
  ```json
  {
    "mainTweet": { ... },
    "replies": [ ... ],
    "totalCount": 42,
    "hasMore": false
  }
  ```

### GET /search
Search tweets with advanced filters.
- Query parameters:
  - `q` (required) - Search query
  - `searchType` (optional) - One of `top` (default), `latest`, `photos`, `videos`
  - `from` (optional) - Filter by author
  - `to` (optional) - Filter by recipient
  - `since` (optional) - Start date (YYYY-MM-DD)
  - `until` (optional) - End date (YYYY-MM-DD)
  - `filter` (optional) - One of `media`, `images`, `videos`, `links`, `replies`, `native_video`
  - `minRetweets` (optional) - Minimum retweet count
  - `minFaves` (optional) - Minimum favorite count
  - `minReplies` (optional) - Minimum reply count
  - `lang` (optional) - Language code

### POST /tweets
Posts a new tweet.
- Request body: `{ "text": "Your tweet content here" }`

### GET /cookies/:domain
Retrieves cookies for a specific domain.
- `:domain` - The domain to get cookies for (e.g., `x.com`)
- Query parameters:
  - `urls` (optional) - Comma-separated list of specific URLs to get cookies for

### POST /cookies/:domain
Sets cookies for a specific domain.
- `:domain` - The domain to set cookies for
- Request body (JSON):
  ```json
  {
    "cookies": [
      { "name": "cookie_name", "value": "cookie_value", "path": "/", "secure": true }
    ]
  }
  ```
- Or raw cookie string (Content-Type: `text/plain`):
  ```
  cookie1=value1; cookie2=value2
  ```

### DELETE /clear/:domain?
Clears browser data (cookies, cache, storage).
- `:domain` (optional) - Specific domain to clear data for. If omitted, clears all data.
- Query parameters (all default to `true`):
  - `cookies` - Clear cookies
  - `localStorage` - Clear local storage
  - `sessionStorage` - Clear session storage
  - `indexedDB` - Clear IndexedDB
  - `cache` - Clear browser cache
  - `all` - Clear all data types

### POST /clear/:domain?
Alternative to DELETE for clearing browser data.
- Request body:
  ```json
  {
    "cookies": true,
    "localStorage": true,
    "sessionStorage": true,
    "indexedDB": true,
    "cache": true,
    "all": false
  }
  ```

### GET /page/*
Fetches a web page and extracts content via CSS selector.
- The URL path after `/page/` is treated as the target URL (with `https://` prefix)
- Query parameters:
  - `__selector__` (optional) - CSS selector to extract. If omitted, returns full page HTML

### POST /page/*
Fetches a web page and extracts content via multiple CSS selectors.
- The URL path after `/page/` is treated as the target URL (with `https://` prefix)
- Request body:
  ```json
  {
    "selectors": { "title": "h1", "content": ".main" },
    "timeout": 10
  }
  ```

### GET /fetch/*
Fetches a web page and returns its main content as Markdown. Uses a two-tier strategy:
1. First tries content negotiation with `Accept: text/markdown` header
2. If the server doesn't return `text/markdown`, loads the page via CDP (with full JS rendering) and extracts the main content using [defuddle](https://github.com/kepano/defuddle)

- The URL path after `/fetch/` is the target URL. URLs without a scheme default to `https://`
- Query parameters:
  - `inPage` (optional) - Set to `true` to run defuddle in the browser page context (has access to computed styles and Shadow DOM). Default: `false` (runs in Node.js)
- Examples:
  - `GET /fetch/https://example.com/article`
  - `GET /fetch/example.com/article?inPage=true`
- Response:
  ```json
  {
    "url": "https://example.com/article",
    "source": "content-negotiation | defuddle",
    "title": "Article Title",
    "author": "Author Name",
    "description": "...",
    "domain": "example.com",
    "published": "2026-01-01",
    "content": "# Article Title\n\nArticle body in markdown...",
    "wordCount": 1234
  }
  ```

### POST /fetch
Full version of the fetch endpoint. Accepts the URL in the request body, which avoids issues with complex URLs containing query strings or fragments.
- Request body:
  ```json
  {
    "url": "http://example.com/path?key=value&foo=bar#section",
    "inPage": false
  }
  ```
- Response: Same as `GET /fetch/*`

### GET /reset
Resets the browser by navigating to `about:blank`.

### POST /macro/playback
Plays back a recorded macro.
- Request body: Validated against `PlaybackRequest` Zod schema

### MCP (Model Context Protocol)

The server exposes MCP endpoints for tool integration:

- **GET /sse** - SSE transport for MCP connections
- **POST /messages?sessionId=...** - Message handler for SSE transport
- **POST /mcp** - Streamable HTTP transport for MCP (stateless)

Available MCP tools:
- `readTweet` - Read a tweet by URL, returns article markdown or thread text

## Timeout Configuration

The server implements a multi-layer timeout system to prevent hanging requests:

### API Layer (HTTP)
- **Timeout**: 120 seconds
- **Response**: HTTP 504 with message "Request timeout - the operation took too long"
- **Excluded routes**: `/sse`, `/mcp`, `/messages` (streaming endpoints)

### Browser Operation Timeouts
All timeouts are configurable via `TimeoutConfig`:

| Phase | Default | Error Type |
|-------|---------|------------|
| CDP Connection | 5000ms | `CDPConnectionTimeoutError` |
| Page Enable | 100ms | `PageEnableTimeoutError` |
| Page Navigation | 30000ms | `PageNavigationTimeoutError` |
| Page Load | 30000ms | `PageLoadTimeoutError` |
| XHR Wait | 30000ms | `XhrWaitTimeoutError` |
| Idle Detection | 3000ms | `PageLoadedWithoutMatchError` |

### Session Expiry Detection
When accessing Twitter endpoints, if the page loads but the expected API request is not detected (indicating session expiry), the server returns:
- **HTTP 403** with `{ "error": "session_expired", "message": "Twitter session expired, please re-login" }`

## Running the Server

The server runs on port 3000 by default, or on the port specified by the `PORT` environment variable.

## Advanced Environment Configuration

The development environment can be customized through a `.env` file in the project root. Below are the available configuration options:

### Chrome/Chromium Settings

```env
# Chrome DevTools Protocol (CDP) port
# Default: 9222
CDP_PORT=9222

# Chrome user data directory
# If not specified, will use default directory based on OS:
# - macOS: ~/Library/Application Support/BrowserAgent
# - Windows: %APPDATA%/Local/BrowserAgent
# - Linux: ~/.browseragent
CHROME_USER_DATA_DIR=/path/to/your/chrome/profile

# Run Chrome in headless mode
# Set to 'true' to run Chrome without GUI
# Default: false
CHROME_HEADLESS=false
```

### Example Configuration

A complete `.env` file might look like this:

```env
CDP_PORT=9333
CHROME_USER_DATA_DIR=/Users/username/Projects/browser-agent/chrome-data
CHROME_HEADLESS=true
```

### Notes

- All settings are optional and have sensible defaults
- The CDP URL will be automatically injected into your development environment as `process.env.CDP_URL`
- Chrome/Chromium executable is automatically detected on your system
- If running in CI/CD environments, it's recommended to set `CHROME_HEADLESS=true`
