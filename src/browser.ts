import { BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs";
import { USER_DATA_DIR, HEADLESS } from "./config";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

export const setupBrowser = async (): Promise<{
  context: BrowserContext;
  page: Page;
}> => {
  const userDataPath = path.resolve(USER_DATA_DIR);
  const executablePath =
    process.env.USE_SYSTEM_CHROME === "true"
      ? process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : "/usr/bin/google-chrome"
      : undefined;

  const context = await chromium.launchPersistentContext(userDataPath, {
    headless: HEADLESS,
    ...(executablePath ? { executablePath } : {}),
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1, 
    locale: "en-US",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--force-device-scale-factor=1",
    ],
  });

  try {
    const storageStatePath = path.resolve("storageState.json");
    if (fs.existsSync(storageStatePath)) {
      const state = JSON.parse(fs.readFileSync(storageStatePath, "utf8"));
      if (state.cookies?.length > 0) {
        await context.addCookies(state.cookies);
        console.log(`Loaded ${state.cookies.length} cookies`);
      }
    }
  } catch (e) {
    console.warn("Failed to load storageState.json:", e);
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    document.documentElement.style.zoom = "100%";
  });

  const page =
    context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const client = await context.newCDPSession(page);
  await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.0 });

  await page.evaluate(() => {
    document.body.style.zoom = "100%";
  });

  return { context, page };
};
