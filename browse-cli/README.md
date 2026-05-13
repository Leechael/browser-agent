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
| `browse tweet get <url>` | Get a specific tweet |
| `browse tweet thread <url>` | Get tweet thread with replies |
| `browse reset` | Reset browser |

## Global Flags

- `--json` — Output raw JSON
- `--plain` — Output compact plain text
- `--jq <expr>` — Filter JSON with jq expression (requires --json)
- `-v, --version` — Show version
