# browser-agent

This is an experiemental project that exposes an x.com account as API, it need you run Chrome with CDP enabled and login the x.com account first.

## Environment Configuration

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
