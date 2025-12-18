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
    // "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    "/usr/bin/google-chrome";
  const userAgents = [
    // a few common Chrome user agents (desktop)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
  ];

  const locales = ["en-US", "en-GB", "ru-RU", "nl-NL"];
  const timezones = [
    "Europe/Amsterdam",
    "Europe/London",
    "America/New_York",
    "Asia/Kolkata",
  ];

  const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
  const locale = locales[Math.floor(Math.random() * locales.length)];
  const timezoneId = timezones[Math.floor(Math.random() * timezones.length)];
  const viewportOptions = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
  ];
  const viewport =
    viewportOptions[Math.floor(Math.random() * viewportOptions.length)];

  const context = await chromium.launchPersistentContext(userDataPath, {
    headless: HEADLESS,
    executablePath,
    userAgent: ua,
    viewport,
    locale,
    timezoneId,
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

  // Enhanced fingerprinting overrides
  await context.addInitScript(() => {
    // navigator.webdriver
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // languages
    try {
      Object.defineProperty(navigator, "languages", {
        get: () => [navigator.language || "en-US"],
      });
    } catch (e) {}

    // platform
    try {
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    } catch (e) {}

    // hardwareConcurrency & deviceMemory
    try {
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    } catch (e) {}
    try {
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    } catch (e) {}

    // permissions query override for notifications/clipboard
    try {
      const originalQuery =
        (navigator as any).permissions && (navigator as any).permissions.query;
      if (originalQuery) {
        (navigator as any).permissions.query = (params: any) =>
          params && params.name === "notifications"
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(params);
      }
    } catch (e) {}

    // WebGL vendor/renderer spoof
    try {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (
        parameter: number
      ) {
        // UNMASKED_VENDOR_WEBGL = 37445, UNMASKED_RENDERER_WEBGL = 37446
        if (parameter === 37445) return "Intel Inc.";
        if (parameter === 37446) return "Intel Iris OpenGL Engine";
        return getParameter.call(this, parameter);
      };
    } catch (e) {}
  });

  const page =
    context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  return { context, page };
};
