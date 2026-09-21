// Unified Page Loader Abstraction (FETCH vs PLAYWRIGHT)
import fs from 'fs';
import path from 'path';
import { Page, BrowserContext } from 'playwright';
import { Site, PageAction, ScrapeMethod } from '../../src/types';
import { extractXPathFromHtml, XPathResult } from './xpathExtractor';
import { fetchHtmlForUrl } from './engine';
import { createPlaywrightContext } from './playwrightBrowserManager';

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'snapshots');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'data', 'screenshots');

if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

export interface LoadedPage {
  url: string;
  scrapeMethod: ScrapeMethod;
  content: string;
  evaluateXPath(xpathQuery: string): Promise<XPathResult>;
  captureSnapshot(contextName: string): Promise<{ htmlPath: string; screenshotPath: string }>;
  close(): Promise<void>;
}

// Generate an SVG screenshot representation when real image capture is not applicable
function generateSvgScreenshot(html: string, contextName: string, subtext: string = ''): string {
  const lines = html
    .split('\n')
    .slice(0, 30)
    .map((l) => l.trim().slice(0, 80))
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <rect width="800" height="500" fill="#0f172a"/>
    <rect x="20" y="20" width="760" height="460" rx="8" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <text x="40" y="60" fill="#38bdf8" font-family="monospace" font-size="16" font-weight="bold">📷 Snapshot Capture [${new Date().toISOString()}]</text>
    <text x="40" y="85" fill="#94a3b8" font-family="monospace" font-size="12">Context: ${contextName} ${subtext ? `(${subtext})` : ''}</text>
    <line x1="40" y1="100" x2="740" y2="100" stroke="#475569" stroke-width="1"/>
    <foreignObject x="40" y="110" width="720" height="350">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color: #cbd5e1; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; overflow: hidden; height: 340px;">
        ${lines.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </div>
    </foreignObject>
  </svg>`;
}

export class FetchLoadedPage implements LoadedPage {
  url: string;
  scrapeMethod: ScrapeMethod = 'FETCH';
  content: string;

  constructor(url: string, content: string) {
    this.url = url;
    this.content = content;
  }

  async evaluateXPath(xpathQuery: string): Promise<XPathResult> {
    return extractXPathFromHtml(this.content, xpathQuery);
  }

  async captureSnapshot(contextName: string): Promise<{ htmlPath: string; screenshotPath: string }> {
    const timestamp = Date.now();
    const safeName = contextName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const htmlFilename = `${safeName}_${timestamp}.html`;
    const screenshotFilename = `${safeName}_${timestamp}.svg`;

    const htmlFullPath = path.join(SNAPSHOTS_DIR, htmlFilename);
    const screenshotFullPath = path.join(SCREENSHOTS_DIR, screenshotFilename);

    fs.writeFileSync(htmlFullPath, this.content, 'utf-8');
    const svg = generateSvgScreenshot(this.content, contextName, 'FETCH method');
    fs.writeFileSync(screenshotFullPath, svg, 'utf-8');

    return {
      htmlPath: `/api/snapshots/${htmlFilename}`,
      screenshotPath: `/api/screenshots/${screenshotFilename}`
    };
  }

  async close(): Promise<void> {
    // No-op for fetch
  }
}

export class PlaywrightLoadedPage implements LoadedPage {
  url: string;
  scrapeMethod: ScrapeMethod = 'PLAYWRIGHT';
  content: string;
  private page: Page;
  private context: BrowserContext;

  constructor(url: string, content: string, page: Page, context: BrowserContext) {
    this.url = url;
    this.content = content;
    this.page = page;
    this.context = context;
  }

  async evaluateXPath(xpathQuery: string): Promise<XPathResult> {
    if (!xpathQuery || !xpathQuery.trim()) {
      return {
        success: false,
        count: 0,
        values: [],
        firstValue: '',
        error: 'عبارت XPath خالی است'
      };
    }

    try {
      // Use Playwright page locator for XPath
      const locator = this.page.locator(`xpath=${xpathQuery}`);
      const count = await locator.count();

      if (count > 0) {
        const values: string[] = [];
        for (let i = 0; i < count; i++) {
          try {
            const txt = await locator.nth(i).innerText({ timeout: 2000 });
            values.push(txt.trim());
          } catch {
            const textContent = await locator.nth(i).textContent();
            values.push(textContent?.trim() || '');
          }
        }
        return {
          success: true,
          count,
          values,
          firstValue: values[0] || ''
        };
      }
    } catch {
      // In case locator syntax had an issue, fallback to evaluating rendered HTML
    }

    // Fallback on the rendered DOM content
    return extractXPathFromHtml(this.content, xpathQuery);
  }

  async captureSnapshot(contextName: string): Promise<{ htmlPath: string; screenshotPath: string }> {
    const timestamp = Date.now();
    const safeName = contextName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const htmlFilename = `${safeName}_${timestamp}.html`;
    const screenshotFilename = `${safeName}_${timestamp}.png`;

    const htmlFullPath = path.join(SNAPSHOTS_DIR, htmlFilename);
    const screenshotFullPath = path.join(SCREENSHOTS_DIR, screenshotFilename);

    fs.writeFileSync(htmlFullPath, this.content, 'utf-8');

    try {
      if (!this.page.isClosed()) {
        await this.page.screenshot({
          path: screenshotFullPath,
          fullPage: false,
          timeout: 5000
        });
        return {
          htmlPath: `/api/snapshots/${htmlFilename}`,
          screenshotPath: `/api/screenshots/${screenshotFilename}`
        };
      }
    } catch (err) {
      console.warn('Playwright screenshot capture failed, falling back to SVG:', err);
    }

    // Fallback to SVG representation if binary screenshot failed
    const svgFilename = `${safeName}_${timestamp}.svg`;
    const svgFullPath = path.join(SCREENSHOTS_DIR, svgFilename);
    const svg = generateSvgScreenshot(this.content, contextName, 'Playwright browser render');
    fs.writeFileSync(svgFullPath, svg, 'utf-8');

    return {
      htmlPath: `/api/snapshots/${htmlFilename}`,
      screenshotPath: `/api/screenshots/${svgFilename}`
    };
  }

  async close(): Promise<void> {
    try {
      if (!this.page.isClosed()) {
        await this.page.close().catch(() => {});
      }
    } catch {
      // Ignore
    }
    try {
      await this.context.close().catch(() => {});
    } catch {
      // Ignore
    }
  }
}

// Execute Page Actions on a live Playwright Page
async function executePlaywrightActions(page: Page, actions: PageAction[]): Promise<void> {
  const sorted = [...actions].filter((a) => a.active).sort((a, b) => a.order - b.order);

  for (const act of sorted) {
    try {
      switch (act.action_type) {
        case 'WAIT': {
          const waitMs = parseInt(act.value || '1000', 10);
          await page.waitForTimeout(Math.min(waitMs, 10000));
          break;
        }

        case 'CLICK': {
          const selector = act.selector?.trim();
          if (!selector) throw new Error('سلکتور جهت کلیک تعیین نشده است');
          const target = selector.startsWith('//') || selector.startsWith('(')
            ? `xpath=${selector}`
            : selector;
          await page.locator(target).first().click({ timeout: 5000 });
          break;
        }

        case 'SCROLL': {
          const pixels = parseInt(act.value || '500', 10);
          await page.evaluate((y) => window.scrollBy(0, y), pixels);
          break;
        }

        case 'SCROLL_TO': {
          const selector = act.selector?.trim();
          if (!selector) throw new Error('سلکتور جهت اسکرول تعیین نشده است');
          const target = selector.startsWith('//') || selector.startsWith('(')
            ? `xpath=${selector}`
            : selector;
          await page.locator(target).first().scrollIntoViewIfNeeded({ timeout: 5000 });
          break;
        }

        case 'WAIT_FOR_ELEMENT': {
          const selector = act.selector?.trim();
          if (!selector) throw new Error('سلکتور المان مشخص نشده است');
          const target = selector.startsWith('//') || selector.startsWith('(')
            ? `xpath=${selector}`
            : selector;
          const maxWait = parseInt(act.value || '5000', 10);
          await page.locator(target).first().waitFor({ state: 'attached', timeout: Math.min(maxWait, 10000) });
          break;
        }
      }
    } catch (err: any) {
      console.warn(`Warning: Playwright page action ${act.action_type} failed:`, err.message);
      // Let subsequent actions attempt unless fatal
    }
  }
}

export async function loadSourcePage(
  url: string,
  site: Site,
  actions: PageAction[] = [],
  timeoutMs: number = 30000,
  preloadedHtml?: string
): Promise<LoadedPage> {
  const method: ScrapeMethod = site.scrape_method === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'FETCH';

  if (method === 'PLAYWRIGHT') {
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      context = await createPlaywrightContext();
      page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);

      if (preloadedHtml) {
        await page.setContent(preloadedHtml, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      } else {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      }

      // If site has wait_after_load
      if (site.wait_after_load && site.wait_after_load > 0) {
        await page.waitForTimeout(Math.min(site.wait_after_load, 10000));
      }

      // Execute Page Actions on live Playwright page
      if (actions.length > 0) {
        await executePlaywrightActions(page, actions);
      }

      // Grab fully rendered HTML
      const renderedHtml = await page.content();
      return new PlaywrightLoadedPage(url, renderedHtml, page, context);
    } catch (err: any) {
      // Clean up in case of error during page setup
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      throw new Error(`خطای بارگذاری مرورگر Playwright: ${err.message}`);
    }
  } else {
    // FETCH method
    const html = preloadedHtml || (await fetchHtmlForUrl(url, timeoutMs));

    // Warn if interactive actions were defined on a FETCH site
    const hasInteractive = actions.some(
      (a) => a.active && ['CLICK', 'SCROLL', 'SCROLL_TO', 'WAIT_FOR_ELEMENT'].includes(a.action_type)
    );
    if (hasInteractive) {
      console.warn(
        `[Notice] Site "${site.name}" uses FETCH scrape method but page "${url}" has interactive Page Actions. For interactive clicks/scrolls, switch site scrape_method to PLAYWRIGHT.`
      );
    }

    return new FetchLoadedPage(url, html);
  }
}
