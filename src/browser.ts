import { chromium, BrowserContext, Page } from 'playwright';
import { USER_DATA_DIR, HEADLESS } from './config';
import path from 'path';

export const setupBrowser = async (): Promise<{ context: BrowserContext; page: Page }> => {
  const userDataPath = path.resolve(USER_DATA_DIR);
  
  console.log(`Launching browser with persistent context at: ${userDataPath} (Headless: ${HEADLESS})`);

  const context = await chromium.launchPersistentContext(userDataPath, {
    headless: HEADLESS, // Respect env var
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
    ],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  // Anti-detection scripts
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  return { context, page };
};
