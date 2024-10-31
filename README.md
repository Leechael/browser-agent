# browser-agent

This is an experiemental project that exposes an x.com account as API, it need you run Chrome with CDP enabled and login the x.com account first.

## How can I run the Chrome instance with CDP enabled?

```shell
/opt/homebrew/Caskroom/chromium/latest/chrome-mac/Chromium.app/Contents/MacOS/Chromium --remote-debugging-port=9222 --user-data-dir=$HOME"/Library/Application Support/Google/Chrome/Profile 2"  --no-default-browser-check --disable-client-side-phishing-detection --remote-debugging-targets=true
```

## TODO

Make it fit for the project [tee-he-he](https://github.com/tee-he-he/err_err_ttyl) as standalone container image.
