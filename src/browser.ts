import { chromium, BrowserContext, Page } from "playwright";
import path from "path";
import { USER_DATA_DIR, HEADLESS } from "./config";

export const setupBrowser = async (): Promise<{
  context: BrowserContext;
  page: Page;
}> => {
  const userDataPath = path.resolve(USER_DATA_DIR);

  const executablePath =
    // "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    "/usr/bin/google-chrome";

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

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page =
    context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  page.on("websocket", (ws) => {
    console.log("WebSocket opened:", ws.url());
    ws.on("close", () => console.log("WebSocket closed/disconnected!"));
  });

  page.on("request", (req) => {
    if (req.url().includes("x.com"))
      console.log("> REQ", req.method(), req.url());
  });

  page.on("response", (res) => {
    if (
      res.url().includes("x.com") &&
      (res.status() === 401 || res.status() === 429)
    ) {
      console.log("< ERROR RES", res.status(), res.url());
    }
  });

  return { context, page };
};
