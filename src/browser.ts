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
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  // "/usr/bin/google-chrome";

  const context = await chromium.launchPersistentContext(userDataPath, {
    headless: HEADLESS,
    executablePath,
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "Europe/Amsterdam",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      "--disable-extensions-except=",
      "--load-extension=",
    ],
  });

  // Если есть сохранённый storageState.json, загрузим cookies и localStorage
  try {
    // Prefer storageState.json in repo root, fallback to USER_DATA_DIR/storageState.json
    const candidates = [
      path.resolve("storageState.json"),
      path.resolve(USER_DATA_DIR, "storageState.json"),
    ];
    let storageStatePath: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        storageStatePath = c;
        break;
      }
    }
    if (storageStatePath) {
      const raw = fs.readFileSync(storageStatePath, "utf8");
      const state = JSON.parse(raw);
      if (Array.isArray(state.cookies) && state.cookies.length > 0) {
        try {
          await context.addCookies(state.cookies as any);
          console.log(
            `Loaded ${state.cookies.length} cookies from storageState.json`
          );
        } catch (e) {
          console.warn("Failed to add cookies from storageState.json:", e);
        }
      }

      if (Array.isArray(state.origins) && state.origins.length > 0) {
        for (const origin of state.origins) {
          try {
            const originUrl = origin.origin;
            const pageForOrigin = await context.newPage();
            try {
              await pageForOrigin.goto(originUrl, {
                waitUntil: "domcontentloaded",
                timeout: 10000,
              });
            } catch (e) {
              // возможно origin не доступен — всё равно попытаемся записать localStorage via evaluate
            }
            if (Array.isArray(origin.localStorage)) {
              for (const entry of origin.localStorage) {
                try {
                  await pageForOrigin.evaluate(
                    ([k, v]) => localStorage.setItem(k, v),
                    [entry.name, entry.value]
                  );
                } catch (e) {}
              }
            }
            await pageForOrigin.close();
            console.log(`Loaded localStorage for origin ${originUrl}`);
          } catch (e) {
            console.warn("Failed to load localStorage for origin:", e);
          }
        }
      }
    } else {
      // no storageState found
    }
  } catch (e) {
    console.warn("Error while loading storageState.json:", e);
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page =
    context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  return { context, page };
};
