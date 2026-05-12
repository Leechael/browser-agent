---
name: browse
description: Web content retrieval via browse CLI. Includes general web page fetching (Markdown extraction) and Twitter/X content access (tweets, timelines, threads, search). Preferred over curl for all web content tasks.
triggers:
  - fetch web page
  - get web content
  - extract article
  - read webpage
  - web content
  - url content
  - 抓取网页
  - 获取网页内容
  - tweet
  - twitter
  - x.com
---

# Browse Skill

## Overview

This skill provides web content access via the `browse` CLI. It should be the **default choice** for accessing web pages and Twitter/X content, replacing direct curl usage in most cases.

**Why use this over curl:**
- Handles JavaScript-rendered pages (SPA, React, Vue, etc.)
- Extracts clean Markdown content automatically
- Provides structured Twitter/X data (not just HTML)
- No need to manually parse HTML
- Auth and domain config are centralized in `~/.config/browse-cli/config.toml`

## Prerequisites

The `browse` CLI must be installed and configured:

```bash
# Install
cd browse-cli && make install

# Configure
mkdir -p ~/.config/browse-cli
cat > ~/.config/browse-cli/config.toml << 'EOF'
url   = "https://browse.oyodeo.com"
token = "your-bearer-token"
EOF
```

## Global Flags

All commands support:
- `--json` — Output raw JSON
- `--plain` — Output compact plain text
- `--jq <expr>` — Filter JSON with jq expression (requires `--json`)

---

## Part 1: General Web Content

### browse fetch <url>

Fetches any web page and returns main content as Markdown.

**Strategy:**
1. First tries content negotiation with `Accept: text/markdown`
2. Falls back to CDP rendering + defuddle extraction

**Options:**
- `--in-page` — Run defuddle in browser context for Shadow DOM support

**Examples:**
```bash
browse fetch https://example.com/article
browse fetch example.com/article --in-page
```

**Response (JSON):**
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

### browse page <url>

Fetch web page with CSS selector extraction.

**Options:**
- `--selector` — CSS selector to extract

**Example:**
```bash
browse page https://example.com --selector "article.main"
```

---

## Part 2: Twitter/X Content

### browse timeline home

Retrieves the home timeline tweets.

### browse timeline mentions

Retrieves mentions for the authenticated user.

### browse user <screen_name>

Retrieves tweets from a specific user's timeline.

**Options:**
- `--tab` — `tweets` (default), `replies`, `media`

**Example:**
```bash
browse user elonmusk --tab=media
```

### browse tweet get <screen_name> <tweet_id>

Retrieves a specific tweet with full metadata.

**For article tweets, includes:**
- `article` — Resolved blocks with inlined entity data
- `article_markdown` — Article content as Markdown
- `article_title` — Article title
- `article_cover` — Cover image URL

**Example:**
```bash
browse tweet get elonmusk 1234567890
```

### browse tweet thread <screen_name> <tweet_id>

Retrieves a tweet thread with replies.

**Options:**
- `--max` — Maximum replies to fetch (default: 100)

**Response:**
```json
{
  "mainTweet": { ... },
  "replies": [ ... ],
  "totalCount": 42,
  "hasMore": false
}
```

### browse search <query>

Search tweets with advanced filters.

**Options:**
- `--type` — `top` (default), `latest`, `photos`, `videos`
- `--from` — Filter by author
- `--to` — Filter by recipient
- `--since` — Start date (YYYY-MM-DD)
- `--until` — End date (YYYY-MM-DD)
- `--filter` — `media`, `images`, `videos`, `links`, `replies`, `native_video`
- `--min-retweets` — Minimum retweet count
- `--min-faves` — Minimum favorite count
- `--min-replies` — Minimum reply count
- `--lang` — Language code

**Example:**
```bash
browse search "web3" --from=vitalikbuterin --since=2026-01-01 --min-retweets=100
```

### browse post <text>

Posts a new tweet.

**Example:**
```bash
browse post "Hello from browse CLI"
```

---

## Part 3: Browser Management

### browse cookies get <domain>

Retrieves cookies for a specific domain.

**Options:**
- `--urls` — Comma-separated list of specific URLs

### browse cookies set <domain>

Sets cookies for a specific domain.

**Options:**
- `--raw` — Raw cookie string (e.g. `cookie1=value1; cookie2=value2`)

### browse clear [domain]

Clears browser data (cookies, cache, storage, etc.).

**Options:**
- `--cookies`
- `--local-storage`
- `--session-storage`
- `--indexed-db`
- `--cache`
- `--all`

### browse reset

Resets the browser by navigating to `about:blank`.

---

## Usage Examples

### Fetch article content

```bash
browse fetch https://example.com/article --json --jq '.content'
```

### Get specific tweet

```bash
browse tweet get elonmusk 1234567890 --json
```

### Get user timeline

```bash
browse user elonmusk --tab=tweets --json
```

### Search tweets

```bash
browse search "AI" --lang=en --min-retweets=50 --json
```

### Get thread with replies

```bash
browse tweet thread elonmusk 1234567890 --max=50 --json
```

---

## When to Use What

| Scenario | Command | Notes |
|----------|---------|-------|
| General article/blog | `browse fetch <url>` | Clean Markdown extraction |
| Specific tweet | `browse tweet get <user> <id>` | Structured tweet data |
| Thread with replies | `browse tweet thread <user> <id>` | Main tweet + replies array |
| User timeline | `browse user <screen_name>` | Use `--tab` for tweets/replies/media |
| Search tweets | `browse search <query>` | Advanced filters available |
| Home timeline | `browse timeline home` | Your own timeline |
| Mentions | `browse timeline mentions` | Your notifications |
| Post tweet | `browse post <text>` | POST with text body |
| CSS extraction | `browse page <url>` | When you need specific elements |

---

## Error Handling

- **504 Timeout**: Request took too long (>120s for HTTP, or per-phase timeouts)
- **403 session_expired**: Twitter session expired, needs re-login
- **Navigation failed**: URL unreachable or 4xx/5xx
- **Exit codes**: `0` success, `1` error, `2` auth failure, `3` not found

---

## Notes

- The API runs on a browser-agent instance with a logged-in Chrome profile
- `browse status` checks connectivity and config validity
- For saving tweets to Roam Research, use the dedicated `tweet-bookmark` skill
