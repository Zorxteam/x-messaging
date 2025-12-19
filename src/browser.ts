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
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome";

  const context = await chromium.launchPersistentContext(userDataPath, {
    headless: HEADLESS,
    executablePath,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1, // Важно! Без этого страница может быть увеличена
    locale: "en-US",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--force-device-scale-factor=1", // Принудительно устанавливаем масштаб 100%
    ],
  });

  // Загрузка сохраненных cookies (persistent context уже хранит localStorage)
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

  // Минимальные overrides (StealthPlugin уже делает большую часть)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    // Принудительно устанавливаем зум 100% на всех страницах
    (document.documentElement.style as any).zoom = "100%";
  });

  const page =
    context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Принудительно устанавливаем масштаб страницы 100% через CDP
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.0 });

  // Принудительно сбрасываем зум на 100%
  await page.evaluate(() => {
    (document.body.style as any).zoom = "100%";
  });

  return { context, page };
};
