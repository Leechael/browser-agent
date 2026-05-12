# browse

CLI for browser-agent web content API.

## Install

```bash
cd browse-cli
make build
# or
make install
```

## Configuration

Create `~/.config/browse-cli/config.toml`:

```toml
url   = "https://your-domain.com"
token = "your-bearer-token"
```

## Commands

| Command | Description |
|---------|-------------|
| `browse status` | Check API connectivity and config |
| `browse fetch <url>` | Fetch web page as markdown |
| `browse page <url>` | Fetch page with CSS selector |
| `browse tweet get <user> <id>` | Get a specific tweet |
| `browse tweet thread <user> <id>` | Get tweet thread with replies |
| `browse user <screen_name>` | Get user timeline |
| `browse search <query>` | Search tweets |
| `browse timeline home` | Get home timeline |
| `browse timeline mentions` | Get mentions |
| `browse post <text>` | Post a tweet |
| `browse cookies get <domain>` | Get cookies |
| `browse cookies set <domain>` | Set cookies |
| `browse clear [domain]` | Clear browser data |
| `browse reset` | Reset browser |

## Global Flags

- `--json` — Output raw JSON
- `--plain` — Output compact plain text
- `--jq <expr>` — Filter JSON with jq expression (requires --json)
- `-v, --version` — Show version
