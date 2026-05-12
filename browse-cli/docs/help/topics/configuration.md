# Configuration

browse reads configuration from `~/.config/browse-cli/config.toml`.

## Setup

```toml
url   = "https://your-domain.com"
token = "your-bearer-token"
```

- `url`   — The base URL where your browser-agent instance is exposed (can be `http://` for local).
- `token` — The authorization bearer token sent on every request.

Create the file before running any command:

```bash
mkdir -p ~/.config/browse-cli
cat > ~/.config/browse-cli/config.toml << 'EOF'
url   = "https://browse.oyodeo.com"
token = "your-bearer-token"
EOF
```
