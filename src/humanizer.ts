import { Page } from 'playwright';

// Random sleep between min and max milliseconds
export const randomSleep = async (min: number, max: number) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise(resolve => setTimeout(resolve, ms));
};

// Type text with variable delay to simulate human typing
export const humanType = async (page: Page, selector: string, text: string) => {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.random() * 100 + 50 }); // 50-150ms delay per key
    if (Math.random() < 0.1) { // 10% chance to pause briefly
      await randomSleep(100, 400);
    }
  }
};

// Move mouse in a somewhat "human" way (simplified spline-like behavior via Playwright steps)
export const humanClick = async (page: Page, selector: string) => {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Element ${selector} not found`);

  // Start from current position? Playwright doesn't expose current cursor easily without managing it yourself.
  // We'll just define a random point within the target box
  const x = box.x + box.width * (0.2 + Math.random() * 0.6); // Inner 60% of width
  const y = box.y + box.height * (0.2 + Math.random() * 0.6); // Inner 60% of height

  await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) }); // Move in steps
  await randomSleep(100, 300);
  await page.mouse.down();
  await randomSleep(50, 150);
  await page.mouse.up();
};

export const scrollToElement = async (page: Page, selector: string) => {
    const element = page.locator(selector);
    await element.scrollIntoViewIfNeeded();
    await randomSleep(300, 700);
}
