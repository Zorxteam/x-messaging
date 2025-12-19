import { Page } from "playwright";

// Random sleep between min and max milliseconds
export const randomSleep = async (min: number, max: number) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise((resolve) => setTimeout(resolve, ms));
};

// Type text with variable delay to simulate human typing
export const humanType = async (page: Page, selector: string, text: string) => {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.random() * 100 + 50 }); // 50-150ms delay per key
    if (Math.random() < 0.1) {
      // 10% chance to pause briefly
      await randomSleep(100, 400);
    }
  }
};

export const scrollToElement = async (page: Page, selector: string) => {
  const element = page.locator(selector);
  await element.scrollIntoViewIfNeeded();
  await randomSleep(300, 700);
};
