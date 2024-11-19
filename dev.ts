import { spawn, type ChildProcess } from 'child_process';
import { platform } from 'os';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { config } from 'dotenv';

// Load environment variables
config();

// Chrome process handle
let chromeProcess: ChildProcess | null = null;

// Environment configurations with defaults
const PORT = process.env.CDP_PORT ? parseInt(process.env.CDP_PORT, 10) : 9222;
const HEADLESS = process.env.CHROME_HEADLESS === 'true';
const USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || getDefaultUserDataDir();
const START_TIMEOUT = 60_000; // 60 seconds timeout

function getDefaultUserDataDir(): string {
  const os = platform();
  const home = homedir();
  
  if (os === 'darwin') {
    return join(home, 'Library/Application Support/BrowserAgent');
  } else if (os === 'win32') {
    return join(home, 'AppData/Local/BrowserAgent');
  } else {
    return join(home, '.browseragent');
  }
}

function getChromeExecutablePath(): string {
  const os = platform();
  
  if (os === 'darwin') {
    const paths = [
      '/opt/homebrew/Caskroom/chromium/latest/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
    
    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }
  } else if (os === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }
  } else if (os === 'linux') {
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    
    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }
  }
  
  throw new Error('Could not find Chrome/Chromium executable');
}

async function checkChromeReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url + '/json/version');
    if (!response.ok) return false;
    const data = await response.json();
    return !!data.webSocketDebuggerUrl;
  } catch {
    return false;
  }
}

async function waitForChrome(url: string): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < START_TIMEOUT) {
    if (await checkChromeReady(url)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Chrome failed to start within ${START_TIMEOUT}ms`);
}

async function startChrome(): Promise<string> {
  const chromePath = getChromeExecutablePath();
  
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-default-browser-check',
    '--disable-client-side-phishing-detection',
    '--remote-debugging-targets=true',
    '--no-first-run'
  ];

  if (HEADLESS) {
    args.push('--headless=new');
  }
  
  chromeProcess = spawn(chromePath, args, {
    stdio: 'ignore',
    detached: true
  });

  const debuggerUrl = `http://127.0.0.1:${PORT}`;
  
  return new Promise((resolve, reject) => {
    chromeProcess!.once('error', reject);
    
    // Wait for Chrome to be fully ready
    waitForChrome(debuggerUrl)
      .then(() => resolve(debuggerUrl))
      .catch(reject);
  });
}

async function stopChrome(): Promise<void> {
  if (chromeProcess) {
    process.kill(-chromeProcess.pid!);
    chromeProcess = null;
  }
}

// Ensure Chrome is closed on program exit
process.on('SIGINT', () => {
  stopChrome().finally(() => process.exit());
});

process.on('SIGTERM', () => {
  stopChrome().finally(() => process.exit());
});

async function main() {
  try {
    console.log('Starting Chrome...');
    const debuggerUrl = await startChrome();
    console.log(`Chrome DevTools debugger available at: ${debuggerUrl}`);
    
    const devProcess = spawn('tsx', ['watch', '--clear-screen=false', 'index.ts'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CDP_URL: debuggerUrl
      }
    });
    
    devProcess.on('exit', () => {
      stopChrome().finally(() => process.exit());
    });
  } catch (error) {
    console.error('Failed to start:', error);
    await stopChrome();
    process.exit(1);
  }
}

main();
