import { Page } from "playwright";

export const randomSleep = async (min: number, max: number) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const humanType = async (page: Page, selector: string, text: string) => {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.random() * 100 + 50 }); 
    if (Math.random() < 0.1) {
      await randomSleep(100, 400);
    }
  }
};

export const scrollToElement = async (page: Page, selector: string) => {
  const element = page.locator(selector);
  await element.scrollIntoViewIfNeeded();
  await randomSleep(300, 700);
};
