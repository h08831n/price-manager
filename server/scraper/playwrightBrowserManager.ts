// Shared Playwright Headless Browser Manager
import { chromium, Browser, BrowserContext, BrowserContextOptions } from 'playwright';

let browserInstance: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;

export async function getPlaywrightBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  if (launchPromise) {
    return launchPromise;
  }

  launchPromise = (async () => {
    try {
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions'
        ],
        executablePath
      });

      browser.on('disconnected', () => {
        console.warn('Playwright browser disconnected; clearing instance');
        browserInstance = null;
        launchPromise = null;
      });

      browserInstance = browser;
      return browser;
    } catch (err: any) {
      console.error('Failed to launch Playwright Chromium browser:', err);
      launchPromise = null;
      throw err;
    }
  })();

  return launchPromise;
}

export async function createPlaywrightContext(options?: BrowserContextOptions): Promise<BrowserContext> {
  const browser = await getPlaywrightBrowser();
  return await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...options
  });
}

export async function closePlaywrightBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // Ignore error on close
    } finally {
      browserInstance = null;
      launchPromise = null;
    }
  }
}

// Clean shutdown hook
process.on('beforeExit', () => {
  if (browserInstance) {
    browserInstance.close().catch(() => {});
  }
});
